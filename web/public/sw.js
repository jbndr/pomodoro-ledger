// Offline shell for the app under /app/; the marketing pages are network-only.
const CACHE = "pomodoro-ledger-v4";
const SHELL = ["/app/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/")) return;

  if (req.mode === "navigate") {
    if (!url.pathname.startsWith("/app/")) return;
    e.respondWith(fetch(req)
      .then((res) => {
        if (res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/app/", copy)); }
        return res;
      })
      .catch(() => caches.match("/app/")));
    return;
  }

  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return;
  e.respondWith(caches.match(req).then((hit) => {
    const fresh = fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    });
    return hit || fresh;
  }));
});

// A scheduled session is starting. The tag matches the open tab's own reminder, so only one shows.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  const code = typeof d.code === "string" && /^L[A-Z2-9]{5}$/.test(d.code) ? d.code : "";
  const title = typeof d.title === "string" && d.title ? d.title.slice(0, 40) : "A session";
  e.waitUntil(self.registration.showNotification("Pomodoro Ledger", {
    body: title + " is starting.", tag: "pl-session-" + code.slice(1, 4), icon: "/icons/icon-192.png", data: { code },
    timestamp: typeof d.start === "number" ? d.start : Date.now(),
  }));
});

self.addEventListener("notificationclick", (e) => {
  const code = (e.notification.data && e.notification.data.code) || "";
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
    const win = all.find((c) => "focus" in c);
    if (!win) return self.clients.openWindow(code ? "/app/?room=" + code : "/app/");
    return win.focus().catch(() => win).then((w) => { if (code) (w || win).postMessage({ t: "join", code }); });
  }));
});
