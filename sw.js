// Offline helper. Always tries the network first, so visitors get the latest
// listings; falls back to the last saved copy when there is no connection.
const CACHE = "tpm2049-v1";
const CORE = [
  "./", "index.html", "manifest.webmanifest",
  "assets/css/styles.css", "assets/js/app.js", "assets/js/util.js",
  "assets/favicon.svg", "assets/icons/icon-192.png",
  "data/events.json", "data/people.json", "data/companies.json", "data/stack.json",
  "data/sources.json", "data/site.json", "data/attendance.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
