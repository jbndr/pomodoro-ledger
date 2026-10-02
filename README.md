# Pomodoro Ledger on Cloudflare Workers

Cloudflare serves `public/index.html` from its edge. A small Worker (`src/worker.js`) handles `/api/*` for shared rooms. No build step.

## Deploy

Needs Node.js 18 or newer and a free Cloudflare account.

```sh
npm install
npx wrangler login     # opens a browser to authorize, once per machine
npm run deploy
```

Wrangler prints your URL, e.g. `https://pomodoro-ledger.<your-subdomain>.workers.dev`.
Run `npm run dev` to preview locally at http://localhost:8787.

To deploy from CI instead of `wrangler login`, set `CLOUDFLARE_API_TOKEN`
(template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`.

## Custom domain

In the Cloudflare dashboard: Workers & Pages → pomodoro-ledger → Settings → Domains & Routes → Add.

## Where data lives

On this hosted page, tasks, history and settings are stored in the browser's local storage.
They stay on that browser and device, separate from the copy on claude.ai.
Clearing site data for the domain erases them.

## Shared rooms

"Work together" in the header starts a temporary room with a six-character code.
People in a room see each other's phase and time remaining; tasks and history are never sent.
Syncing timers only happens when every person in the room accepts the request.

Each room is one Durable Object (`Room`) holding the WebSocket connections.
A room is deleted ten minutes after the last person leaves.

The creator can remove guests using the × button on their user pills. Creator
permission is verified by the Worker using a private token kept in the creator's
browser session; it survives reloads in that tab. Removed guests are disconnected
without automatic reconnection, but can join again using the invite link.
Rooms created before this feature was deployed have no creator token; create a
new room to use removal controls.

User pill borders fill as timers progress, while the countdown stays visible.
Paused timers keep their progress; idle users show “Ready to focus”. On phones,
room members scroll horizontally, the dial fits the available screen height,
and history tables become labeled cards. On desktop, removal controls appear on
hover or keyboard focus; on touchscreens they stay visible.

Run the room permission checks with `node --test tests/room.cjs`.

## Subtasks

Each open task has a subtask chip in its row (it appears on hover until the task
has subtasks; on touchscreens, open the pencil editor instead). Click it to
expand the checklist under the task, type a step and press Enter to add it, and
keep typing to add more. Pasting several lines adds one subtask per line. The
chip shows progress, e.g. 2/5, and the task you are working on shows its
checklist by default.

Titles are edited inline. Subtasks are saved inside their parent task and remain
visible in the finished-task ledger; reopening the task restores its editable
checklist. Completing subtasks does not automatically finish the parent task.
Cycle estimates, focus sessions, and time tracking belong to the parent task.

## Gentle ticking

Timer settings include an optional gentle ticking sound during focus sessions,
off by default. Enable it to reveal a volume slider, a choice of one-, two- or
four-second spacing, and a six-second preview. The default is quiet (20%) with
a tick every two seconds. Ticking pauses with the timer and stays silent during
breaks. It is independent of the completion bell, and preferences are saved
with the other timer settings. Audio needs a click or key press after reloading.
The rhythm uses a looping audio buffer to avoid background-tab scheduling bursts.

## Floating timer

The pop-out icon at the top left of the timer opens a compact, always-on-top
Picture-in-Picture window on browsers that support the Document Picture-in-Picture
API (on HTTPS or localhost). It shows the current task, remaining time, a progress
border, and start/pause, reset and skip controls. Both views control the same timer;
closing the floating window leaves the timer running. Keep the main tab open.
The icon is hidden when the browser does not support the API. Visibility over
exclusive fullscreen games depends on the operating system and game; windowed
or borderless mode is a better fit.

## Optional labels

A task can have one label, e.g. a project. Focus the new-task input to reveal
the Label chip, the estimate and Add. The chip opens a menu: pick a label, or
type to filter and press Enter to create a new one. Typing `#` in the task title
opens the same menu inline. The chosen label stays selected while you add
several tasks in a row.

On existing tasks, click the label in the task row (or the Label chip that
appears on hover) to change it; the pencil editor has the same chip.

Once any task has a label, filter chips appear above the list: All, one per
label, and No label, each with its open-task count. A selected filter shows the
label's task counts and logged focus time, and new tasks default to that label.

“Manage” in the label menu hides labels from suggestions or restores them.
Hiding a label does not change task assignments or history. Labels are stored
separately from tasks, so finishing or deleting a task does not erase its label.

## Progress by label

Once any task has a label, the Progress section gets two additions. The chips
under the heading scope everything below them (tiles, both charts, the session
log and the finished-task ledger) to one label; each chip shows that label's
total focus time. “Focus by label” breaks focus time, share, cycles, and
finished and open tasks down per label for the last 7 days, 30 days or all time.
Sessions in the log show their task's label. Hovering a day in either chart lists that
day's focus time per label.

## Labels in the session log

Each session has a label chip next to its task name. Click it to select an
existing label, create one, or choose No label. The empty chip appears on hover
or keyboard focus on desktop and remains available on touch screens. Changes
apply only to that session, including unplanned focus, and preserve its task,
date, duration and cycle count. Sessions inherit their task's label until a
session label is explicitly set; No label clears it for that session. Explicit
session labels stay with the session when moving it to another task.

Focus totals, label filters and chart breakdowns use session labels. Task counts,
estimates and the finished-task ledger continue to use the task's own label.
