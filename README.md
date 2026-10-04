# Pomodoro Ledger

A task-focused Pomodoro timer served from Cloudflare's edge. The web app in `web/`
(Svelte 5 and TypeScript) is built with Vite into `dist/`, which Cloudflare serves as static assets; a small
Worker in `src/` powers shared rooms and account sync.

## Features

- Tasks with notes, checklists and cycle estimates, planned into Today, Upcoming days or Later
- Optional Today sections, a day plan with focus vs. time with breaks, and estimated start times
- Quick entry that reads days and estimates from the title, a When popover, and keyboard shortcuts (press `?`)
- Labels, filters, focus history, charts, and finished-task tracking
- Recurring tasks (daily, weekdays, chosen weekdays, monthly, or every few days, weeks or months), and unfinished tasks that roll over to today: always, ask, or never
- Your best time of day for focus, and a weekly recap that opens on the first visit of a new week
- Configurable timers, optional gentle ticking, and a floating Picture-in-Picture timer
- Optional soundscapes during focus (rain, ocean waves, a fireplace or brown noise), generated in the browser so nothing loops
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
  src/soundscape.ts  soundscapes during focus, made in an AudioWorklet (scapeWorklet.ts, lib/scapeSynth.ts)
  src/float.ts       the floating Picture-in-Picture timer
  src/layout.ts      dialog overlays and fitting the timer dial to the window
  src/pages.ts       phone pages; src/zen.ts full screen
  src/lib/*.ts       pure, tested logic: dates, the When parser, quick entry, list order, stats, settings, the timer dial, rooms, export files
  src/timer/         the timer engine (engine.ts) and the timer card
  src/tasks/         task helpers, actions, start-time plan and the task list
  src/progress/      the Progress page and its session actions
  src/composer/      the new-task box
  src/popovers/      the When, label and menu popovers
  src/settings/      the Settings dialog, and export and import
  src/room/          shared-room networking (net.ts) and its dialog and strip
  src/chrome/        top bar tools, banner, shortcut sheet, toast and tooltip
  src/styles/app.css styles
  public/            copied as-is: service worker, manifest, icons
src/                 Cloudflare Worker: rooms and the public room lobby (worker.js) and sync (sync.js)
extension/           an experimental site blocker browser extension, not released (see extension/README.md)
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

The `YEAR_IN_FOCUS` repository secret decides when Year in focus shows up:
`on` (the default when unset), `off`, a start day such as `2026-12-01`, or a
window such as `2026-12-01..2027-01-15`. Dates are checked in the browser, so a
window opens and closes on its own; changing the value needs a new deploy.

## Demo data

Open `/?demo=1` to force an interactive demo, for example
`http://localhost:8787/?demo=1`. Demo changes stay in memory, reset on reload,
and never affect the saved ledger. An unused browser profile also shows the
example data automatically.

## Data storage

Tasks, history, labels, and settings are always kept in the browser's local
storage, so the app works offline. Without sign-in they stay on that device.

**Settings → Data & sync → Export** downloads all of it as one JSON file
(`pomodoro-ledger-YYYY-MM-DD.json`), with or without an account. **Import** reads
that file, or one from the account export, and shows what it holds before
changing anything. Merge is the default: it adds new tasks, keeps the newer copy
of each task as sync does, and keeps sessions from both copies. Replace makes
this browser match the file and asks again first. The demo (`?demo=1`) can't
export or import.

Without an account, the app offers a backup once a visit when the ledger has
real use (20 sessions, or 5 tasks over a week) and this device hasn't exported
in 30 days. **Later** waits 7 days. **Remind me to back up** in Data & sync
turns it off. It stays quiet while the timer runs, in full screen, or with a
dialog open, and while signed in.

## Sync between devices

Signing in syncs tasks, history, labels, settings, and the timer itself across
devices: start on your laptop, pause on your phone. When a cycle ends on two open
devices, it's logged once. Login is handled by Cloudflare Access, and each
person's data lives in its own Durable Object (plain SQLite, one `docs` table),
keyed by email. Conflicts resolve last-write-wins per task. Changes made offline
merge when the device reconnects. Export works the same signed in and reflects
the synced ledger. An import while signed in is saved like any other change, so
it reaches your other devices, and Replace deletes the missing tasks there too.

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

**Scheduled sessions.** Turn on **Repeat** when opening a public room to plan it
for set weekdays and a time window, such as weekdays 9:00–12:00. A schedule is
stored in the creator's time zone (an IANA name, so DST is handled), and
**Upcoming** shows each one's next session in the viewer's own time, with the
creator's time when the zones differ. At start time the session becomes a live
public room on the room clock. Its code is `L`, the schedule's id and two letters
for the date, so everyone lands in the same room; the Room asks the Lobby whether
the session is on before it opens. After the window ends it drops back to
Upcoming. **Remind me** counts you as coming for the next session and, while the
tab is open, plays a bell and shows a notification (if allowed) when it starts.
Reminders are kept in this browser. Schedules live in the `Lobby`, which allows
up to 50, three new ones per address and then one every 20 minutes, and removes a
schedule after three weeks without anyone in its sessions. Only the creator's
browser can remove one sooner.

**Reminders when the app is closed.** Once push is set up (below), **Remind me**
also subscribes the browser to Web Push when notifications are allowed, so the
reminder arrives with the app closed, including the installed app on phones
(iOS 16.4 or newer needs it added to the Home Screen first). Tapping it opens the
app in that session's room. The open tab's reminder and the push share a
notification tag, so only one shows. Without push, or if anything about it
fails, reminders work as before while a tab is open.

The `Lobby` keeps one record per schedule and browser (the client id from
`pl.cid`): the push endpoint and its two keys, nothing else. Turning **Remind
me** off deletes it, and so does removing the schedule or the push service
answering 404 or 410. It accepts up to 40 per schedule and 1,000 in total, ten
subscribe calls per address and then one a minute, and only `https` endpoints
of the browser push services (Google, Mozilla, Apple, Microsoft). The Lobby's
alarm wakes at the next start of every schedule that has subscribers and sends
each one a small encrypted message (title, start time and room code) with
VAPID. `src/push.js` does this with WebCrypto alone: an ES256 VAPID token,
RFC 8291 `aes128gcm` encryption and an RFC 8030 request with `TTL` and
`Urgency`.

To turn push on, generate a VAPID key pair once and store it as secrets:

```sh
npm run vapid                               # prints VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY    # paste the public key
npx wrangler secret put VAPID_PRIVATE_KEY   # paste the private key
npx wrangler secret put VAPID_SUBJECT       # mailto:you@example.com
```

The public key isn't secret (the app reads it from `/api/push`), but keeping it
next to its private key means nothing in the repository changes. Never commit
the private key. Changing the keys later makes existing subscriptions useless:
browsers subscribe again the next time the app opens. For local development put
the same three lines in `.dev.vars`, which git ignores. Until all three are set,
`/api/push` returns no key and the app doesn't offer push.

The room, sync and push checks run as part of `npm test`.

## Custom domain

In the Cloudflare dashboard, go to **Workers & Pages → pomodoro-ledger → Settings
→ Domains & Routes → Add**.
