# Pomodoro Ledger

<img width="939" height="1146" alt="image" src="https://github.com/user-attachments/assets/f1f9dc76-a4f3-429e-a7d5-7ac1523409de" />

A task-focused Pomodoro timer served from Cloudflare's edge. The static app lives
in `public/index.html`; a small Worker in `src/worker.js` powers shared rooms. No
build step is required.

## Features

- Tasks, subtasks, cycle estimates, Today/Later planning, and estimated start times
- Labels, filters, focus history, charts, and finished-task tracking
- Configurable timers, optional gentle ticking, and a floating Picture-in-Picture timer
- Temporary shared rooms that sync timer status while keeping tasks and history private

## Deploy

You need Node.js 18 or newer and a free Cloudflare account.

```sh
npm install
npx wrangler login     # opens a browser to authorize, once per machine
npm run deploy
```

Wrangler prints your URL, for example
`https://pomodoro-ledger.<your-subdomain>.workers.dev`. Run `npm run dev` to
preview locally at `http://localhost:8787`.

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

Signing in syncs tasks, history, labels, and settings across devices. The running
timer stays on each device. Login is handled by Cloudflare Access, and each
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

Run the room and sync checks with:

```sh
npm test
```

## Custom domain

In the Cloudflare dashboard, go to **Workers & Pages → pomodoro-ledger → Settings
→ Domains & Routes → Add**.
