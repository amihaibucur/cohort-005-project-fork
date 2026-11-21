# How Knock delivers in-app Notifications to a React Router app

Research for [issue #2](https://github.com/amihaibucur/cohort-005-project-fork/issues/2), part of the map in [issue #1](https://github.com/amihaibucur/cohort-005-project-fork/issues/1). Researched 2026-11-21 against docs.knock.app, the `@knocklabs/node` README and API reference, the published `@knocklabs/react` npm package (v0.15.1), and knock.app/pricing. Package versions at research time: `@knocklabs/react` 0.15.1, `@knocklabs/node` 1.41.1, `@knocklabs/cli` 1.6.3 (from `npm view`).

## TL;DR for the spec and the prototype

- Cadence's server calls `knock.workflows.trigger("<workflow-key>", { recipients, actor, data })` with the **secret key**. Knock runs the workflow, and its **in-app feed channel step** creates one **message** (a feed item) per recipient.
- The browser renders that feed with `@knocklabs/react`. It uses the **public key**, the **user id**, and the **in-app feed channel ID**. Knock stores the items and tracks seen, read and archived state, and badge counts. Real-time updates come over a websocket that the SDK manages, with no work or extra cost for us.
- A developer must create or collect:
  - the secret API key `sk_…`
  - the public API key `pk_…`
  - the in-app feed channel ID (a UUID)
  - one workflow per v1 Notification, each with an in-app feed step, **committed/published**
  - optionally, the signing key, only if enhanced security mode is turned on
- Free plan: $0, no card, 10,000 messages a month, unlimited environments and seats, unlimited feed retention.

## 1. Core model

- **Workflow**: what a trigger starts. It is made of function steps and channel steps. All channel routing and message design live inside the workflow. ([concepts](https://docs.knock.app/concepts/overview), [React quick start](https://docs.knock.app/getting-started/quick-start/react))
- **Recipient**: either a **User** or an **Object**. A user must be *identified* (stored in Knock) before Knock can notify them or name them as an actor. ([identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients))
- **Channel**: a configured provider. The in-app one is Knock's own **in-app feed channel**. Its channel ID (a UUID) is listed under Settings → Integrations → Channels ("Channels and sources"). ([React quick start](https://docs.knock.app/getting-started/quick-start/react), [headless feed](https://docs.knock.app/in-app-ui/react/headless/feed))
- **Message**: one notification to one recipient on one channel. In the feed it appears as a `FeedItem`. ([concepts](https://docs.knock.app/concepts/overview), [in-app API](https://docs.knock.app/in-app-ui/api-overview))
- **From trigger to feed item**: trigger (API call) → workflow run per recipient → the in-app feed channel step renders the template → a message lands in that user's feed → a `new-message` event goes out on the websocket. Trigger runs are asynchronous, and the API returns only a `workflow_run_id`. ([trigger API ref](https://docs.knock.app/api-reference/workflows/trigger), [in-app API](https://docs.knock.app/in-app-ui/api-overview))
- **The template** is edited in the dashboard under the in-app step's "Edit content". It comes in three variants: Standard (whole cell clickable, optional action URL), Single-action (one button), and Multi-action (primary and secondary buttons). The action URL can be static or set from a Liquid variable such as `{{ data.course_url }}`. The rendered content reaches the client as `blocks` of type `markdown`, `text` or `button_set`. ([in-app feeds](https://docs.knock.app/integrations/in-app/feeds), [in-app API](https://docs.knock.app/in-app-ui/api-overview))
- **Sent content is immutable.** A sent message can only change status. To correct one, archive it and trigger the workflow again. ([in-app feeds FAQ](https://docs.knock.app/integrations/in-app/feeds))
- The whole trigger `data` object is passed through to `FeedItem.data`. In the default `compact` mode, nested arrays and objects are dropped. That makes it the place to carry Cadence ids such as `courseId` for custom rendering. ([in-app API](https://docs.knock.app/in-app-ui/api-overview), [headless feed](https://docs.knock.app/in-app-ui/react/headless/feed))

## 2. Server side: `@knocklabs/node`

Install with `npm install @knocklabs/node`. The README's construction example is `new Knock({ apiKey: process.env.KNOCK_API_KEY })`. `KNOCK_API_KEY` is the default env var, so the option can be omitted. The key passed is the **secret** key. ([knock-node README](https://github.com/knocklabs/knock-node), [Next.js quick start](https://docs.knock.app/getting-started/quick-start/nextjs) shows `KNOCK_API_KEY='sk_…'`)

| Need | Call | Source |
| --- | --- | --- |
| Identify or upsert a user | `knock.users.update(userId, { name, email, ...custom })` (`PUT /v1/users/{id}`) | [api.md](https://github.com/knocklabs/knock-node/blob/main/api.md) |
| Bulk identify | `knock.users.bulk.identify({ users: [...] })` | [api.md](https://github.com/knocklabs/knock-node/blob/main/api.md) |
| Trigger | `knock.workflows.trigger(key, { recipients, actor, data, tenant, cancellation_key, settings })` | [trigger API](https://docs.knock.app/send-notifications/triggering-workflows/api) |
| Address a group | `knock.objects.set(collection, id, {...})` + `knock.objects.addSubscriptions(collection, id, { recipients })`, then trigger with `recipients: [{ collection, id }]` | [subscriptions](https://docs.knock.app/concepts/subscriptions) |
| Mark read server-side | `knock.messages.markAsRead(messageId)`; bulk: `knock.channels.bulk.updateMessageStatus(channelId, action, {...})` | [api.md](https://github.com/knocklabs/knock-node/blob/main/api.md) |
| Sign a user token | `import { signUserToken } from '@knocklabs/node'` → `await signUserToken(userId, { expiresInSeconds })` | [knock-node README](https://github.com/knocklabs/knock-node) |

Key facts:

- **Inline identification**: `recipients` and `actor` accept full recipient objects (`{ id, name, email, ... }`) as well as plain id strings. Knock guarantees the recipient is identified *before* the run. Cadence therefore doesn't need a separate "identify" step: it can upsert people at trigger time. ([trigger API](https://docs.knock.app/send-notifications/triggering-workflows/api), [identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients))
- `KnockProvider` also **identifies the user client-side** when it mounts. This is on by default (`identificationStrategy: "inline"`) and can be turned off with `"skip"`. ([KnockProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider))
- **Limits**:
  - up to **1,000 recipients** per trigger
  - `data` up to **10 MB**
  - custom properties per recipient up to **256 kB**
  - no bulk trigger endpoint; per-recipient data is supported instead

  ([trigger API FAQ](https://docs.knock.app/send-notifications/triggering-workflows/api), [identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients))
- **Addressing "all Platform Admins"** can be done two ways:
  - **(a)** Query the admins from SQLite and pass their ids as `recipients`. This is simplest and fine for fewer than 1,000 people.
  - **(b)** Model an Object, for example collection `roles`, id `platform-admins`, subscribe admins to it, and trigger with `recipients: [{ collection: "roles", id: "platform-admins" }]`.

  With (b), Knock fans out to the object *and* every subscriber. Up to 100 recipients can be subscribed per call, with no cap on the total. Option (b) means keeping Knock's subscription list in sync with Cadence's roles. ([subscriptions](https://docs.knock.app/concepts/subscriptions))
- **`actor`**: the person who caused the Notification, for example the Student who enrolled. It appears as `FeedItem.actors` and the prebuilt cell uses it for the avatar. ([in-app API](https://docs.knock.app/in-app-ui/api-overview), [feed](https://docs.knock.app/in-app-ui/react/feed))
- **Errors**: the SDK throws `Knock.APIError` subclasses (`AuthenticationError` 401, `RateLimitError` 429, …). It retries twice by default and times out after 60 s. ([knock-node README](https://github.com/knocklabs/knock-node))
- **The workflow must be committed** (in production the dashboard calls this "Publish") before an API trigger uses it. Triggering an *inactive* workflow returns `workflow_inactive`. ([version control](https://docs.knock.app/version-control/overview), [triggering overview](https://docs.knock.app/send-notifications/triggering-workflows/overview))

## 3. Client side: `@knocklabs/react`

Setup:

- `npm install @knocklabs/react`
- `import "@knocklabs/react/dist/index.css"`, required for the prebuilt components
- wrap the tree in `<KnockProvider apiKey user={{ id }} [userToken] [enabled]>` and then `<KnockFeedProvider feedId={channelId} [colorMode] [defaultFeedOptions]>`

([feed](https://docs.knock.app/in-app-ui/react/feed), [KnockProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider), [KnockFeedProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-feed-provider))

### Prebuilt components vs hooks

| | Prebuilt (`NotificationIconButton`, `NotificationFeedPopover`, `NotificationFeed`, `NotificationCell`) | Headless hooks (`useKnockClient`, `useNotifications(knockClient, channelId, { mode })`, `useNotificationStore(feedClient)` → `{ items, metadata }`) |
| --- | --- | --- |
| Effort | About 20 lines for bell, badge and popover | We build the bell, list, cell, empty state and actions ourselves |
| Seen/read logic | Built in: opening the popover marks all items seen, clicking a cell marks it read and follows the action URL, "mark all as read", archive "x", unread/read filter | We call `feedClient.fetch()`, `markAllAsSeen()`, `markAsSeen(item)` ourselves. **If we forget, `unseen_count` never decreases.** |
| Look | Knock's own design. Can be themed with `--rnf-*` CSS variables, replaced with custom CSS on the `rnf-` classes, or adjusted with `renderItem`, `avatar`, `renderHeader` and `colorMode="dark"` | Native Tailwind + shadcn components, matching the rest of Cadence |
| Rendering content | Renders the template's blocks | We render `item.blocks[0].rendered` (HTML, via `dangerouslySetInnerHTML`) or build copy from `item.data` |
| Real-time | Yes | Yes, through the same feed client |

Sources: [feed](https://docs.knock.app/in-app-ui/react/feed), [headless feed](https://docs.knock.app/in-app-ui/react/headless/feed), [styling](https://docs.knock.app/in-app-ui/feeds/styling).

- **Tailwind/shadcn**: nothing in the docs mentions Tailwind or shadcn. The prebuilt UI is plain CSS. The package depends on Knock's `@telegraph/*` design-system packages, `lucide-react`, and Radix dialog and hover-card. To get a look native to Cadence, use the **hooks with our own shadcn components**. This was inferred from the package dependency list (`npm view @knocklabs/react dependencies`), not stated in the docs.
- **Click handling**: `onNotificationClick(item)` and `onNotificationButtonClick(item, button)` override the default redirect. Use them to navigate with React Router's `navigate` instead of a full page load. ([handling interactivity](https://docs.knock.app/in-app-ui/feeds/handling-interactivity))
- **Badge**: the default badge is `unseen`. Set `badgeCountType="unread"` to count unread items instead. ([feed](https://docs.knock.app/in-app-ui/react/feed))

### SSR with React Router v7 (framework mode)

Knock has **no React Router guide**. It has quick starts for React (Vite) and Next.js. Its framework adapters (`@knocklabs/react/next` and `/tanstack`) exist only for the guide location sensor, and the peer dependencies on `next` and `@tanstack/react-router` are optional. ([package.json of @knocklabs/react 0.15.1](https://www.npmjs.com/package/@knocklabs/react))

- The ESM bundle starts with `"use client"`. That is a Next.js directive and React Router ignores it, so the components *will* be rendered on the server during SSR.
- The feed is loaded and the websocket opened from effects and the client, so server output can only be the empty or loading state. Badge counts appear after hydration.
- **Unverified**: I did not check whether any `@knocklabs/react` module touches `window` or `document` at import or render time on the server. The safe pattern is to render the bell only on the client (mount guard or `React.lazy`/`ClientOnly`), or to set `enabled={false}` until a user is known. `KnockProvider` has an `enabled` prop that keeps the client idle with no identify, requests or socket. ([KnockProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider)) The prototype or the first implementation ticket should confirm this.
- **Env vars**: React Router loaders run on the server. Pass the public key and channel ID to the client through the root loader, or as `VITE_`-prefixed env vars (the React quick start uses `import.meta.env.VITE_KNOCK_PUBLIC_API_KEY` and `VITE_KNOCK_FEED_CHANNEL_ID`). The secret key stays server-only.
- **DevUI user switching**: changing `user.id` on `KnockProvider` should re-authenticate it. The docs recommend toggling `enabled` rather than remounting the provider when identity changes. The behaviour on switching from one user id to another was not tested.

## 4. Read, unread, seen and archived state

Knock owns all of it. ([message statuses](https://docs.knock.app/send-notifications/message-statuses), [in-app feeds](https://docs.knock.app/integrations/in-app/feeds), [in-app API](https://docs.knock.app/in-app-ui/api-overview))

- **Statuses** are independent of each other (an item can be both seen and read):
  - `seen` (`seen_at`): the item was fetched for display
  - `read` (`read_at`): the user opened it or marked it read
  - `interacted` (`interacted_at`): the cell or a button was clicked
  - `link_clicked`: requires link tracking
  - `archived` (`archived_at`)
- **Counts**: feed `metadata` carries `total_count`, `unread_count` and `unseen_count`, computed by Knock.
- **Archived** items are excluded from the feed by default and can be fetched with the `archived: "only"` filter.
- Cadence stores **nothing** about Notifications in SQLite.

## 5. Real-time delivery

- Knock runs a managed websocket service. The SDK manages connecting, reconnecting and the `new-message` event, which carries badge-count metadata and may be throttled. ([in-app API](https://docs.knock.app/in-app-ui/api-overview), [socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior))
- Optional settings:
  - `auto_manage_socket_connection` disconnects the socket in inactive tabs, after 2000 ms by default.
  - `__experimentalCrossBrowserUpdates` syncs tabs through a BroadcastChannel.

  ([feed](https://docs.knock.app/in-app-ui/react/feed))
- **Cost to us**: none in code or infrastructure, because no server push is needed on our side. The pricing page lists no real-time restriction on the free plan, but it doesn't mention real-time at all. Treat "included" as very likely, not as verified.

## 6. Auth: keys, user tokens and enhanced security

Source for this section: [security & authentication](https://docs.knock.app/in-app-ui/security-and-authentication).

- **Secret key** (`sk_…`): server only, used for triggers and identify.
- **Public key** (`pk_…`): browser, limited to the feed, messages, the user's own profile and preferences.
- **Enhanced security mode**:
  - **Off by default.** While it is off, the public key plus *any* user id can read that user's feed, so a user could read another user's feed.
  - When it is on, every client request needs a **user token**: a JWT signed **RS256** with the environment's **signing key** (Platform → API keys, shown once, env var `KNOCK_SIGNING_KEY`). `sub` holds the user id, and `exp` should match the session length.
  - The server issues the token with `signUserToken(userId)`, default expiry 3600 s, and passes it to `<KnockProvider userToken>`. `onUserTokenExpiring` lets the client refresh it.
  - The docs differ on the import path. The security page shows the older `@knocklabs/node/lib/tokenSigner`, while the v1 README imports it from `@knocklabs/node`. Use the README.
- **Development**: the docs say it's fine to leave enhanced security off in dev. For this learning project, off is acceptable. The spec should still say whether v1 turns it on, since doing so adds the signing key and a token in the root loader.

## 7. Environments, plan and card

- **Environments**:
  - **New accounts (created from October 2026) start with a single *production* environment.**
  - Development plus commit-and-promote is opt-in through "Enable environments", which cannot be undone.
  - Accounts created earlier start with development and production.
  - Each environment has its own users, messages and API keys, and the content in each is versioned separately.

  ([version control overview](https://docs.knock.app/version-control/overview), [environments](https://docs.knock.app/version-control/environments))
- **Free plan**:
  - $0 a month, **no credit card required**
  - up to **10,000 messages a month**, a soft limit: Knock contacts you about billing the next month
  - unlimited environments, seats, workflows and stored profiles
  - **feed retention unlimited**, logs kept 30 days
  - no SAML or SCIM, no translations

  ([pricing](https://knock.app/pricing))
- **Rate limits** are per endpoint and per environment, and exceeding them returns `429`. ([rate limits](https://docs.knock.app/api-reference/overview/rate-limits)) This is irrelevant at our scale.

## 8. Workflow configuration: dashboard vs code

- **Dashboard**: create the workflow, add the in-app feed step, edit content, run tests, then commit or publish. This is the documented quick-start path. ([React quick start](https://docs.knock.app/getting-started/quick-start/react))
- **Code**: the **Knock CLI** handles this.
  - Install with `npm i -g @knocklabs/cli`, then log in with `knock login` or a **service token**.
  - `knock pull` and `knock push` sync workflow files with a `knockDir` defined in `knock.json`. Commit and promote are supported for CI/CD.
  - The **Management API** is the HTTP layer underneath, authenticated with service tokens.

  ([Knock CLI](https://docs.knock.app/developer-tools/knock-cli), [version control](https://docs.knock.app/version-control/overview))
- **Not verified**: whether the CLI or Management API is limited on the free plan. The pricing page lists "unlimited workflows" and is silent on the CLI.

## 9. Testing

- **Dashboard test runner**: runs the *saved* (uncommitted) version against a chosen recipient, actor and data. It has sandbox and skip-delay switches. ([testing workflows](https://docs.knock.app/send-notifications/testing-workflows))
- **API**: `settings: { sandbox_mode: true, skip_delay: true }` on a trigger. For in-app there is no third-party provider to stub, so sandbox mainly matters for other channels.
- **CLI**: `knock workflow run`.
- **Unit and integration tests in our app**: Knock's docs give no guidance on mocking. The usual pattern applies: put `@knocklabs/node` behind a small Cadence module, for example `notify.courseEnrolled(...)`, and substitute a fake in Vitest so tests assert on the triggers recorded. This is my inference, not a Knock recommendation.

## 10. What a developer must create before integrating

1. A Knock account at dashboard.knock.app/signup. Free, no card.
2. Optionally, decide whether to **enable environments** to get a separate development environment. New accounts are production-only, and enabling is one-way.
3. From **Platform → API keys** for the environment in use, copy:
   - the **secret key** → `KNOCK_API_KEY` (server)
   - the **public key** → passed to the client as `KNOCK_PUBLIC_API_KEY` or `VITE_KNOCK_PUBLIC_API_KEY`
4. The **in-app feed channel ID** (Settings → Integrations → Channels → in-app feed) → `KNOCK_FEED_CHANNEL_ID`. **Not verified**: whether a new account ships with an in-app feed channel already created. The quick starts only say to "find" its ID, which suggests it does.
5. **One workflow per v1 Notification**, each with an **In-app feed** channel step. Write the template, using variables from `data`, and an action URL. **Commit/publish** it. The workflow **key** is what the server passes to `trigger`.
6. Only if enhanced security is turned on: generate the **signing key** (`KNOCK_SIGNING_KEY`) and turn on enhanced security mode for that environment.
7. Only if workflows are managed in code: a **service token** for the CLI.

## Unverified or open

- Whether `@knocklabs/react` is safe to import and render under React Router SSR without a client-only guard.
- Whether real-time delivery has any free-plan limits (pricing doesn't mention it).
- Whether a new account already has the in-app feed channel.
- Whether the CLI or Management API is restricted on the free plan.
- How `KnockProvider` behaves when `user.id` changes in place (the DevUI user switch).
