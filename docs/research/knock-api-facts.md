# Knock API facts for Cadence's Notification Feed

Date: 2026-11-22

Scope: recipients, fan-out, failure handling and user tokens, for Cadence's in-app-feed-only Knock setup on the free plan with enhanced security mode and RS256 user tokens. Sources are Knock's docs (fetched as `.md` from docs.knock.app), knock.app/pricing, the installed SDK sources (`@knocklabs/node` 1.41.1, `@knocklabs/client` 0.23.1), and `knocklabs/javascript` on GitHub (`main`).

## Answers at a glance

- **Recipients:** you identify users with `PUT /v1/users/{id}` (`knock.users.update`), or inline by passing recipient objects instead of bare ID strings in `workflows.trigger`. All identify calls upsert. Deleting a user (`knock.users.delete`) hard-deletes the user and every message sent to them, so their feed is gone. The docs say a recipient "must exist in Knock" before you notify them. They don't say what happens when a trigger uses a bare ID Knock has never seen (see Unconfirmed).
- **Fan-out:** a trigger takes at most 1,000 recipients. To fan out through an object, you subscribe users to it (100 per call, no limit on the total) and trigger with the object as the recipient. Audiences can't be targeted by a trigger call. They only trigger workflows when a user joins. "Non-user recipients" (objects) are included on the Free plan. The pricing page doesn't list subscriptions or audiences either way.
- **Failure:** the `Idempotency-Key` header is honored only on `POST /v1/workflows/{key}/trigger`. The window is 24 hours, keys are up to 255 characters, and only 2xx responses are cached. A replay returns the original response with an `idempotent-replayed: true` header. The trigger endpoint is in rate-limit tier 5 (1,000 req/s). A limited request gets a 429. The Node SDK retries 2 times by default, on connection errors, 408, 409, 429 and 5xx, with backoff from 0.5s up to 8s and jitter. It sends one auto-generated `Idempotency-Key` on every non-GET request and reuses it for that call's retries.
- **Tokens:** `signUserToken` defaults to `expiresInSeconds` = 3600 (1 hour), and neither the SDK nor the docs set a maximum. Knock recommends matching your session lifetime, or using short-lived tokens that you refresh. On the client, `authenticate(user, token, { onUserTokenExpiring, timeBeforeExpirationInMs })` uses the signature `(currentToken, decodedToken) => Promise<string | void>` and fires 30,000 ms before `exp` by default. `KnockProvider` takes the same two props.

## 1. Recipients

**Becoming a recipient**

- There are three ways to identify a recipient. Direct identification is `PUT /v1/users/{user_id}`. Inline identification passes recipient data in another call, such as a trigger or `KnockProvider`. Bulk identification is `POST /v1/users/bulk/identify`. "All identification methods in Knock use an upsert approach." (https://docs.knock.app/managing-recipients/identifying-recipients)
- Inline: "Knock guarantees that recipients are identified before executing any other action. This enables lazy recipient creation". This requires recipient *objects*, each with an `id`. (https://docs.knock.app/managing-recipients/identifying-recipients; https://docs.knock.app/send-notifications/triggering-workflows/api)
- A trigger's `recipients` entry is either "A string indicating a user that you have previously identified to Knock" or "A complete `Recipient`, to be identified inline". (https://docs.knock.app/send-notifications/triggering-workflows/api)
- "Your recipient data must exist in Knock to send notifications to those recipients". (https://docs.knock.app/managing-recipients/overview)
- Client side: `KnockProvider` with `user={{ id }}` upserts the user inline. "If you pass a `user` that doesn't exist, Knock will automatically create one" (https://docs.knock.app/getting-started/quick-start/nextjs). In `@knocklabs/client`, `identificationStrategy` defaults to `"inline"`. When `authenticate` gets a user object, it calls `this.user.identify(...)`, and `"skip"` turns that off (`node_modules/@knocklabs/client/dist/esm/knock.mjs`, `authenticate`).
- Custom properties are limited to 256 kB. A direct identify that goes over returns `422`. (https://docs.knock.app/managing-recipients/identifying-recipients)
- Users exist per environment. (https://docs.knock.app/managing-recipients/overview, https://docs.knock.app/concepts/users)

**Unknown user ID in a trigger**

- The docs don't say whether a bare-string ID Knock has never seen is auto-created, skipped or treated as an error, or whether an in-app feed message is created for it. (See Unconfirmed.)
- The documented safe path is to identify inline in the trigger (pass `{ id, name, ... }`) or to identify ahead of time.

**Update / delete**

- Update: `PUT /v1/users/{user_id}`, rate-limit tier 3. It merges, "updating only the fields included". (https://docs.knock.app/api-reference/users/update) The Node SDK method is `knock.users.update(userId, body)` (`node_modules/@knocklabs/node/resources/users/users.js`). Bulk: `knock.users.bulk.identify(...)`, up to 1,000 users, tier 1. (https://docs.knock.app/api-reference/users/bulk/identify)
- Delete: `DELETE /v1/users/{user_id}`, tier 2, "Permanently delete a user and all associated data." (https://docs.knock.app/api-reference/users/delete) The SDK method is `knock.users.delete(userId)` (`resources/users/users.js`). Bulk: `POST /v1/users/bulk/delete`, up to 1,000 users, tier 1, `knock.users.bulk.delete(...)`. (https://docs.knock.app/api-reference/users/bulk/delete)
- A delete hard-deletes the user's properties, preferences, channel data, subscriptions and schedules. It also deletes "All messages sent to that user, including the content of those messages", plus the workflow-run logs. Data can't be recovered, and processing "can take up to 10 minutes". If you reuse the ID later, you get a fresh user with no history. (https://docs.knock.app/managing-recipients/deleting-users)
- After deletion, the user "will no longer be able to be a recipient or an actor in a workflow". In-app messages that reference the user, for example as actor, show a "missing user" marker. (https://docs.knock.app/concepts/users)

## 2. Fan-out to "all Platform Admins"

**(a) A list of user IDs in `recipients`**

- "You can trigger a workflow for up to 1000 recipients at a time." Bulk trigger requests aren't supported. (https://docs.knock.app/send-notifications/triggering-workflows/api) The SDK type also says "Limited to 1,000 recipients." (`node_modules/@knocklabs/node/resources/workflows.d.ts`)

**(b) Objects and subscriptions**

1. Create the object: `knock.objects.set(collection, id, body)`.
2. Subscribe users to it: `knock.objects.addSubscriptions(collection, objectId, { recipients })` (`resources/objects/objects.js`). This is `POST /v1/objects/{collection}/{id}/subscriptions`, tier 3, and it supports inline identification. (https://docs.knock.app/api-reference/objects/add_subscriptions)
3. Trigger with `{ collection, id }` as the recipient.

- Knock "will enqueue a new workflow run for the object itself **and** fan out to all of its subscribers". (https://docs.knock.app/concepts/subscriptions)
- Limits: "subscribe up to 100 recipients to an object at a time … There is no limit to the number of recipients you can subscribe to an object". Removal is also 100 per call. Nesting goes to a maximum depth of 2. (https://docs.knock.app/concepts/subscriptions)
- Knock deduplicates recipients across the direct list and subscribers. (https://docs.knock.app/concepts/subscriptions)
- Bulk variants exist: `knock.objects.bulk.addSubscriptions` and `deleteSubscriptions` (`resources/objects/bulk.js`).

**(c) Audiences**

- "It's not yet possible to trigger a workflow for an audience via the API." (https://docs.knock.app/send-notifications/triggering-workflows/api)
- Audience triggers fire only for **new** members who join. You can't trigger "to all users in an audience". (https://docs.knock.app/send-notifications/triggering-workflows/audiences)
- Static audience membership is managed with `knock.audiences.addMembers` and `removeMembers`, up to 1,000 members per call, tier 3. (https://docs.knock.app/concepts/audiences; https://docs.knock.app/api-reference/audiences/add_members)
- Audiences don't fit a one-off "notify all admins" trigger.

**Plan availability** (https://knock.app/pricing)

- The plans are named Free, Starter and Enterprise. The pricing page has no plan called "Developer".
- Free includes up to 10,000 messages a month, unlimited workflows and workflow triggers, unlimited stored profiles, and in-app feeds with unlimited retention.
- "Non-user recipients" (objects) is marked Yes on all plans.
- Subscriptions and Audiences aren't listed in the comparison table. I found no docs callout that gates them to a paid plan. The docs gate per-tenant branding and preferences, translations and SSO to Enterprise.
- Rate-limit tiers are the same on every plan: "Knock does not have separate rate limit tiers for different accounts or pricing plans". (https://docs.knock.app/api-reference/overview/rate-limits)

## 3. Failure handling

**Idempotency** (https://docs.knock.app/api-reference/overview/idempotent-requests; https://docs.knock.app/send-notifications/triggering-workflows/api)

- Header: `Idempotency-Key`, a string of up to 255 characters.
- "only `POST /workflows/:key/trigger` accepts the `Idempotency-Key` header; sending it on any other endpoint has no effect."
- The window is 24 hours from the original request. The docs call it "the default idempotency window", which suggests support may be able to change it.
- A duplicate within the window returns "the same response as the original request" with the headers `original-x-request-id: <id>` and `idempotent-replayed: true`.
- If the parameters don't match the original, Knock returns an error. The docs don't give the status code.
- Only 2xx responses are cached. After a 4xx or 5xx, a retry with the same key runs again.
- The docs don't say what the key is scoped to (environment or account).

**Rate limits** (https://docs.knock.app/api-reference/overview/rate-limits)

- Tier 1 = 1 req/s, tier 2 = 5 req/s, tier 3 = 60 req/s, tier 4 = 200 req/s, tier 5 = 1,000 req/s. Tiers are assigned per endpoint.
- Limits are scoped per environment for API keys, and per environment and signing user for user tokens.
- An exceeded limit returns `429 Too Many Requests`. The page doesn't document a `Retry-After` header.
- Endpoint tiers:
  - Trigger: 5 (1,000 req/s) (https://docs.knock.app/api-reference/workflows/trigger)
  - `users.update`: 3
  - `users.delete`: 2
  - `addSubscriptions`: 3
  - bulk identify and bulk delete: 1
- Batch and bulk endpoints may also apply per-entity dedup limits. These still return 2xx, with `x-ratelimited-{param}` headers. (https://docs.knock.app/api-reference/overview/batch-rate-limits)

**Node SDK retries** (`node_modules/@knocklabs/node/client.js`; `node_modules/@knocklabs/node/README.md` "Retries")

- `maxRetries` defaults to 2. You can configure it per client or per request. The request timeout defaults to 1 minute, and timeouts are retried.
- `shouldRetry` retries on connection errors and timeouts and on 408, 409, 429 and >= 500. An `x-should-retry: true|false` response header overrides this. Other 4xx responses aren't retried.
- Backoff honors `retry-after-ms` and `retry-after` when they're present. Otherwise it waits `min(0.5s * 2^n, 8s)` with up to 25% jitter subtracted.
- Idempotency: `buildHeaders` sets `Idempotency-Key` on every non-GET request. It uses `options.idempotencyKey` if you supply one, or else generates `stainless-node-retry-<uuid4>`. The key is written to the request's options object, which is reused for retries, so every retry of a single `trigger()` call sends the same key. Because Knock honors the key on trigger, the SDK's own retries don't create duplicate runs.
- A *new* `trigger()` call, such as an app-level or job-queue retry, gets a new random key and is **not** deduplicated. To dedupe across those, pass a stable key: `knock.workflows.trigger(key, body, { idempotencyKey: "..." })` (`internal/request-options.d.ts`).
- The SDK adds an `X-Stainless-Retry-Count` header to each request.

## 4. User tokens and enhanced security

**Signing** (`node_modules/@knocklabs/node/lib/tokenSigner.js`, `lib/tokenSigner.d.ts`)

- `signUserToken(userId, { signingKey?, expiresInSeconds?, grants?, shouldGenerateJti? })` signs with RS256 using `jose`.
- The payload is `{ sub, grants, iat, exp, jti? }`.
- `expiresInSeconds` defaults to `60 * 60` (3600s). The SDK doesn't enforce a maximum. The README example uses 43200 (12h). (`node_modules/@knocklabs/node/README.md`)
- `signingKey` defaults to the `KNOCK_SIGNING_KEY` environment variable and accepts PEM or base64-encoded PEM.

**Enhanced security** (https://docs.knock.app/in-app-ui/security-and-authentication)

- It's off by default and recommended for production.
- When it's on, Knock "will reject requests from the client using your public API key that do not include a signed user token".
- The JWT must be RS256-signed with the environment's private signing key (Platform > API keys) and must carry `sub`. `iat` and `exp` are recommended.
- `grants`, with `explicit_grants: true`, can restrict a token to resources such as `user/feed_read` and `user/feed_write`.

**Expiry guidance** (same page, "Handling token expiration")

- "advisable to set the token expiration to be equal to your session token expiration". If that isn't possible, use "a relatively short-lived expiration time … and refresh them from your backend before the expiration window."
- Calling `authenticate` again with a new token restarts the real-time connection.
- No documented maximum `exp`.

**Client refresh** (`node_modules/@knocklabs/client/dist/types/interfaces.d.ts`, `dist/esm/knock.mjs`; GitHub `packages/client/src/knock.ts`)

- `knock.authenticate(userIdOrUser, userToken, { onUserTokenExpiring?, timeBeforeExpirationInMs?, identificationStrategy?: "inline" | "skip" })`.
- The callback type is `UserTokenExpiringCallback = (currentToken: string, decodedToken: JwtPayload) => Promise<string | void>`.
- `timeBeforeExpirationInMs` defaults to `30_000`, and the timer is floored at `MIN_TOKEN_EXPIRATION_DELAY_MS = 1_000`.
- When the timer fires, the client calls your callback. If the callback returns a string, the client re-authenticates with it and reschedules. It skips the refresh when the new token's `exp` isn't later than the old one, or would fire immediately (`refreshMakesProgress`).
- If you return nothing, the client does nothing.
- No timer is scheduled when the token has no `exp` or has already expired.

**React** (GitHub `knocklabs/javascript`, `packages/react-core/src/modules/core/context/KnockProvider.tsx`)

- `KnockProviderProps` includes `onUserTokenExpiring` and `timeBeforeExpirationInMs`, typed from `AuthenticateOptions`, and passes them to `authenticate`.
- These two props aren't listed on the KnockProvider docs page (https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider). That page does document `userToken`, `identificationStrategy` and `enabled`.

## Sources

- https://docs.knock.app/managing-recipients/identifying-recipients
- https://docs.knock.app/managing-recipients/overview
- https://docs.knock.app/managing-recipients/deleting-users
- https://docs.knock.app/concepts/users
- https://docs.knock.app/concepts/subscriptions
- https://docs.knock.app/concepts/objects
- https://docs.knock.app/concepts/audiences
- https://docs.knock.app/send-notifications/triggering-workflows/api
- https://docs.knock.app/send-notifications/triggering-workflows/audiences
- https://docs.knock.app/getting-started/quick-start/nextjs
- https://docs.knock.app/api-reference/workflows/trigger
- https://docs.knock.app/api-reference/users/update
- https://docs.knock.app/api-reference/users/delete
- https://docs.knock.app/api-reference/users/bulk/identify
- https://docs.knock.app/api-reference/users/bulk/delete
- https://docs.knock.app/api-reference/objects/add_subscriptions
- https://docs.knock.app/api-reference/audiences/add_members
- https://docs.knock.app/api-reference/overview/idempotent-requests
- https://docs.knock.app/api-reference/overview/rate-limits
- https://docs.knock.app/api-reference/overview/batch-rate-limits
- https://docs.knock.app/in-app-ui/security-and-authentication
- https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider
- https://knock.app/pricing
- https://github.com/knocklabs/javascript (`packages/client/src/knock.ts`, `packages/react-core/src/modules/core/context/KnockProvider.tsx`)
- Local `node_modules/@knocklabs/node` 1.41.1: `client.js`, `README.md`, `lib/tokenSigner.js`, `resources/users/users.js`, `resources/workflows.{js,d.ts}`, `resources/objects/objects.js`, `resources/objects/bulk.js`, `resources/audiences.js`, `internal/request-options.d.ts`
- Local `node_modules/@knocklabs/client` 0.23.1: `dist/esm/knock.mjs`, `dist/types/interfaces.d.ts`

## Unconfirmed / open

- **Bare unknown user ID in a trigger.** The docs don't say whether Knock auto-creates the user, skips the recipient or errors, or whether a feed message is created. The docs only say recipients "must exist", and that inline identification gives lazy creation. Verify empirically, for example in the `/prototype/knock` page. Otherwise, always identify inline or ahead of time.
- **Subscriptions and Audiences on the Free plan.** The pricing page doesn't list them, and no docs plan callout gates them. Objects ("Non-user recipients") are confirmed as Free.
- **Idempotency key details.** The scope (environment or account) and the HTTP status for a key reused with different parameters aren't documented.
- **429 headers.** The docs don't say whether the 429 includes `Retry-After`. The SDK honors it if it's present.
- **Maximum token lifetime.** Knock doesn't document a maximum `exp`.
- **Feed after deletion.** "Hard delete all messages sent to that user" implies the feed is emptied. The docs don't explicitly say "feed".
