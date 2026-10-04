# Site Blocker for Pomodoro Ledger

A small browser extension that blocks the sites you choose while a focus round
runs in [Pomodoro Ledger](https://pomodoro.jbndr.com). Instead of the site you
get a calm page with the time left, your current task, and a way back to the
timer. Breaks and paused rounds leave every site open.

It's Manifest V3 for Chrome and Chromium browsers (Edge, Brave, Arc), and also
loads in Firefox 140 or newer. Plain JS, HTML and CSS with no build step. It
isn't in any extension store yet.

## Install

**Chrome, Edge, Brave, Arc**

1. Download or clone this repository.
2. Open `chrome://extensions` (`edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the `extension/` folder.
5. Pin the extension, open its options and add the sites to block.

**Firefox**: open `about:debugging#/runtime/this-firefox`, click **Load
Temporary Add-on…** and pick `extension/manifest.json`. Temporary add-ons are
removed when Firefox quits.

Open Pomodoro Ledger, or reload it if it was already open. **Settings →
Automation → Block distracting sites** then shows "Extension connected".

## How it works

- The app posts its timer to the page on every change (start, pause, resume,
  skip, the end of a phase, a new mode, a minute added or taken away, and a
  timer synced from another device) and once on load:
  `{ source: "pomodoro-ledger", type: "timer", mode, status, endsAt, task }`.
- `content.js` runs only on `https://pomodoro.jbndr.com/*` and
  `http://localhost/*`. It accepts messages from the page's own window and
  origin and forwards them to the background. It also sets
  `<html data-pl-extension="<version>">`, which is how the app knows the
  extension is there.
- `background.js` validates each message: a known mode and status, `endsAt` a
  number within the next 3 hours while running and `null` otherwise, and a task
  name of at most 200 characters. Then it stores the timer and rebuilds its
  `declarativeNetRequest` dynamic rules.
- While focus runs, top-level navigations (`main_frame` only) to a listed site
  or any of its subdomains redirect to `blocked.html?u=<original URL>`. Pause,
  skip, a break, or reset removes the rules right away.
- An alarm at `endsAt` removes the rules, so blocking ends on time even if the
  app tab is closed or the computer slept. The rules are checked again when the
  browser starts and whenever the service worker wakes. A timer not heard from
  in over 3 hours never blocks.
- **Open anyway for 5 minutes** adds a higher-priority allow rule for that one
  site. You get 3 per focus round, and they reset when the round ends.
- An open blocked page goes back to the original URL as soon as the round ends.

`lib.js` holds the pure logic (domain normalisation, rule building, the "block
now?" decision and message validation). `tests/extension.mjs` covers it, and
`npm test` runs it.

## Permissions

| Permission | Why |
| --- | --- |
| `declarativeNetRequest` | Adds and removes the blocking rules. The browser applies them; the extension never sees your browsing. |
| `storage` | Keeps your site list (`storage.sync`) and the current timer and passes (`storage.local`). |
| `alarms` | Ends blocking at the end of the round, even when no tab is open. |
| Host access to `pomodoro.jbndr.com` and `localhost` | Runs the content script that hears the timer, and lets the blocked page find and focus an open app tab (`tabs.query` by URL), so the `tabs` permission isn't needed. |
| Optional host access, one site at a time | Asked when you add a site. Chrome only redirects a request to the extension's page with host access to that site; without it, the redirect rule is silently skipped. If you decline, the site is still blocked with a plain `block` rule, which shows the browser's own error page. Options shows these sites and offers **Allow access**. |

There's no `<all_urls>` permission, no `tabs`, no `webRequest` and no
`webNavigation`. The manifest lists `*://*/*` under `optional_host_permissions`
only so it can ask per site. Nothing is granted at install.

`blocked.html` is a web-accessible resource, because a link on another site can
only navigate to an extension page that's listed there.

## Privacy

Everything stays in your browser. The extension makes no network requests. The
only things it stores are the site list, the timer state (mode, status, end
time, task name) and the passes used this round.

## Develop

```sh
npm test                 # includes tests/extension.mjs
npm run extension:zip    # writes dist-extension/pomodoro-ledger-site-blocker-<version>.zip
```

After you change a file, click the reload icon on the extension's card in
`chrome://extensions`. The app counts as connected on any `http://localhost`
port, so `npm run dev` works with it.

The fonts in `fonts/` (Bricolage Grotesque, Geist, Geist Mono; Latin subset)
are bundled under the SIL Open Font License, so the pages load nothing remote.
