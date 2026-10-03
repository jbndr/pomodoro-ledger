// Offline shell: the page is fetched fresh when online and served from cache when not.
const CACHE = "pomodoro-ledger-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

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
    e.respondWith(fetch(req)
      .then((res) => {
        if (res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); }
        return res;
      })
      .catch(() => caches.match("/")));
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
