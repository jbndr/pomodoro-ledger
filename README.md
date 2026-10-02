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

Tasks, history, labels, and settings are stored in the browser's local storage.
They stay on that browser and device. Clearing site data erases them.

## Shared rooms

"Work together" creates a temporary room with a six-character invite code. Room
members share timer state, but never tasks or history. Each room uses one Durable
Object and is deleted ten minutes after the last person leaves.

Run the room permission checks with:

```sh
node --test tests/room.cjs
```

## Custom domain

In the Cloudflare dashboard, go to **Workers & Pages → pomodoro-ledger → Settings
→ Domains & Routes → Add**.
