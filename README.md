# Pomodoro Ledger

A task-focused Pomodoro timer served from Cloudflare's edge. The web app in `web/`
(Svelte 5 and TypeScript) is built with Vite into `dist/`, which Cloudflare serves as static assets; a small
Worker in `src/` powers shared rooms and account sync.

## Features

- Tasks with notes, checklists and cycle estimates, planned into Today, Upcoming days or Later
- Optional Today sections, a day plan with focus vs. time with breaks, and estimated start times
- Quick entry that reads days and estimates from the title, a When popover, and keyboard shortcuts (press `?`)
- Labels, filters, focus history, charts, and finished-task tracking
- Configurable timers, optional gentle ticking, and a floating Picture-in-Picture timer
- Installable as an app on phones (PWA) that opens offline, with a full-screen timer page and bottom tabs
- Optional sign-in to sync tasks, history, settings, and the running timer between devices
- Temporary shared rooms that sync timer status while keeping tasks and history private
- Public rooms to drop into, where everyone's timer follows the room's clock
- Quick reactions in rooms (👋 🎉 🔥 👍 ☕), with a one-tap 🎉 after each round

## Project layout

```
web/                 the app (Vite root)
  index.html         page shell the components mount into
  src/main.ts        boot: global listeners, mounting the components, first render
  src/state.ts       shared state (tasks, settings, the timer) and the local/session storage helpers
  src/store.ts       saving tasks, settings and labels: this browser, or the account when signed in
  src/cloud.ts       account sync over a WebSocket, last write wins
  src/render.ts      redraws the components after a change
  src/ui.ts          handles to the mounted dialogs and popovers
  src/keys.ts        app-wide keyboard shortcuts
  src/sound.ts       bells and the optional ticking
  src/float.ts       the floating Picture-in-Picture timer
  src/layout.ts      dialog overlays and fitting the timer dial to the window
  src/pages.ts       phone pages; src/zen.ts full screen
  src/lib/*.ts       pure, tested logic: dates, the When parser, quick entry, list order, stats, settings, the timer dial, rooms
  src/timer/         the timer engine (engine.ts) and the timer card
  src/tasks/         task helpers, actions, start-time plan and the task list
  src/progress/      the Progress page and its session actions
  src/composer/      the new-task box
  src/popovers/      the When, label and menu popovers
  src/settings/      the Settings dialog
  src/room/          shared-room networking (net.ts) and its dialog and strip
  src/chrome/        top bar tools, banner, shortcut sheet, toast and tooltip
  src/styles/app.css styles
  public/            copied as-is: service worker, manifest, icons
src/                 Cloudflare Worker: rooms and the public room lobby (worker.js) and sync (sync.js)
tests/               Worker tests (node:test)
```

## Develop

```sh
npm install
npm run dev      # builds, rebuilds on change, and serves app + Worker on http://localhost:8787
npm test         # type check, app unit tests (Vitest), Worker tests
```

`npm run dev` rebuilds on every save; reload the page to see changes.

## Deploy

You need Node.js 20 or newer and a free Cloudflare account.

```sh
npm install
npx wrangler login     # opens a browser to authorize, once per machine
npm run deploy
```

`npm run deploy` builds the app and deploys it with the Worker. Wrangler prints
your URL, for example `https://pomodoro-ledger.<your-subdomain>.workers.dev`.

To deploy from CI instead of `wrangler login`, set `CLOUDFLARE_API_TOKEN`
(template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`.

## Demo data

Open `/?demo=1` to force an interactive demo, for example
`http://localhost:8787/?demo=1`. Demo changes stay in memory, reset on reload,
and never affect the saved ledger. An unused browser profile also shows the
example data automatically.

## Data storage

Tasks, history, labels, and settings are always kept in the browser's local
storage, so the app works offline. Without sign-in they stay on that device.

## Sync between devices

Signing in syncs tasks, history, labels, settings, and the timer itself across
devices: start on your laptop, pause on your phone. When a cycle ends on two open
devices, it's logged once. Login is handled by Cloudflare Access, and each
person's data lives in its own Durable Object (plain SQLite, one `docs` table),
keyed by email. Conflicts resolve last-write-wins per task. Changes made offline
merge when the device reconnects. **Settings → Sync → Export** downloads
everything as JSON.

Sync stays off until Access is configured:

1. In the Cloudflare dashboard, open **Zero Trust**. The free plan covers up to
   50 users. Pick a team name, which gives you `<team>.cloudflareaccess.com`.
2. Under **Settings → Authentication**, keep **One-time PIN** or add Google or
   GitHub as a login method.
3. Under **Access → Applications → Add an application → Self-hosted**:
   - Domain: `pomodoro.jbndr.com`, path: `api/sync`
   - Session duration: something long, for example 1 month
   - Policy: **Allow**, include **Emails** with the addresses that may sign in
4. Copy the application's **Audience (AUD) tag**. Put it and your team domain
   into `wrangler.jsonc`:

   ```jsonc
   "vars": {
     "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",
     "ACCESS_AUD": "<aud tag>"
   }
   ```

5. Deploy. Then open `https://pomodoro.jbndr.com/api/sync/me` in a private
   window. It must redirect to the Cloudflare login. If it shows JSON instead,
   the Access path doesn't cover `/api/sync`.

The Worker verifies the Access token itself (signature, audience, issuer, and
expiry), so a misconfigured route fails closed rather than exposing data.

For local development, sign in as a fixed address by putting this in `.dev.vars`.
The dev identity only works while Access is unset, which is why the first two
lines blank it locally:

```sh
ACCESS_TEAM_DOMAIN=
ACCESS_AUD=
DEV_USER_EMAIL=you@example.com
```

## Shared rooms

"Work together" creates a temporary room with a six-character invite code. Room
members share timer state, but never tasks or history. Each room uses one Durable
Object and is deleted ten minutes after the last person leaves.

Public rooms hold up to 12 people and run on a shared clock instead of sync
requests: 25/5 rounds start on the hour and half hour, 50/10 rounds on the hour.
Joining jumps your timer to the room's current round, and each phase that ends
with the room clock starts the next one in step. Pausing or skipping takes you
off the clock until you rejoin. Nobody owns a public room, so there's no
removing people and nothing to vote on.

Anyone in a room can send a reaction from a fixed set of five emoji. Others see
it for a few seconds next to the room strip, with the sender's name, and
matching reactions fold into one bubble. Reactions carry only the member's room
id, name and emoji. The Room Durable Object drops anything else and limits each
person to 5 in a burst, then one every 4 seconds. **Settings → Sound & alerts →
Reactions** turns them off, which ignores incoming reactions and hides the
button.

**Work together → Public rooms** lists them. A house room for each rhythm is
always listed, and a full one spills over into "Pomodoro 2". Anyone can also open
a named public room for 2 to 12 people, which stays listed while someone is in it. The list comes
from a single `Lobby` Durable Object that public rooms report to whenever someone
joins or leaves, and every five minutes while occupied. A room that stops
reporting drops off after twelve minutes.

The room and sync checks run as part of `npm test`.

## Custom domain

In the Cloudflare dashboard, go to **Workers & Pages → pomodoro-ledger → Settings
→ Domains & Routes → Add**.
