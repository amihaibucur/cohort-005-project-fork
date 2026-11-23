# Giving the agent a browser

This is how you drive a page in the app, and ask it questions.

It uses [agent-browser](https://github.com/vercel-labs/agent-browser), a CLI
built for exactly this — one command per action, an answer on stdout.

## Once, per machine

```bash
npm install -g agent-browser
agent-browser install
```

## Starting and stopping the app

Start the dev server in the background, keep its PID, and wait until it
answers:

```bash
npm run dev > /tmp/dev.log 2>&1 & echo $! > /tmp/dev.pid
until curl -s -o /dev/null http://localhost:5173/; do sleep 1; done
```

Stop it by that PID, in a command of its own:

```bash
kill $(cat /tmp/dev.pid)
```

`pkill -f "react-router dev"` matches the shell running the `pkill` itself,
and kills everything after it in the same command.

The examples below use `http://localhost:5173`, the dev server's default
address. If `/tmp/dev.log` shows a different one, use that.

## Signing in as a user

Pages behind the app layout answer 401 until a user is in the session. The
seed gives fixed IDs: `1` is an admin, `2` an instructor, `5` a student. Sign
in with one request, then open the page:

```bash
agent-browser open http://localhost:5173/
agent-browser eval "fetch('/api/switch-user', {method: 'POST', body: new URLSearchParams({userId: '5'})}).then(r => r.status)"
agent-browser open http://localhost:5173/dashboard
```

## Judging how it looks

A screenshot is evidence for a person, and for you. Open your "after"
screenshot with the Read tool and look at it. When the ticket uses words of
feel or mood ("like the sky", "calm", "playful"), judge the screenshot against
those words, not only against the DOM: would someone looking at it think of
the thing the ticket names? A sky is layered, luminous and deep; a flat
pale-blue fill is a colour, not a sky.

For a mood ticket, try two or three options, screenshot each, keep the one
that best evokes the words, and show the others in the PR as alternatives.

## Asking your own question

A screenshot is pixels. To verify a fix you need a yes or a no, so read the
DOM:

```bash
agent-browser open http://localhost:5173/courses
agent-browser find placeholder "Search courses..." fill "typescript"
agent-browser find role button click --name "Search"

# Did the search reach the URL?
agent-browser get url

# How many course cards came back?
agent-browser get count 'a[href^="/courses/"]'

# What does the empty state say, if there is one?
agent-browser get text main

# Did anything break?
agent-browser errors
agent-browser console
```

The commands worth knowing: `open`, `click`, `fill`,
`find <role|text|label|placeholder> …`, `wait`, `get text|html|attr|count|url`,
`is visible|enabled|checked`, `eval`, `snapshot` (the accessibility tree, with
refs), `screenshot`, `console`, `errors`, `close`. `agent-browser --help` has
the rest.

**Ask the page, do not ask the person.** A change you have not looked at is a
change you are reporting on trust.

Screenshots are PR evidence: a before and an after for a change that shows in
the UI.

## Two things that will bite you

**Hydration lags "networkidle".** The button is in the server HTML before
React attaches its `onClick`, so the first click can be a silent no-op. Poll
for the click's effect and click again, rather than waiting a fixed time.

**Vite re-optimizes on the first load.** On a fresh checkout, the first page
load discovers dependencies Vite has not pre-bundled, and pushes a full-page
reload a moment after the response has finished. Absorb it once against a
throwaway load before the real loop; otherwise it lands mid-interaction and
every click after it hits a page that is already navigating away.
