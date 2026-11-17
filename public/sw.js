/* HUPPY CUBE service worker
   - Never touches /api/, payments, admin, or any non-GET request.
   - Never caches HTML pages (so order/tracking data is never stored).
   - Only caches: offline page, app icons, and Vite's hashed /assets/ files. */

const VERSION = "v1";
const STATIC_CACHE = `huppy-static-${VERSION}`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("huppy-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheableStatic(url) {
  return url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;              // PesaPal etc. untouched
  if (url.pathname.startsWith("/api/")) return;                 // API untouched
  if (url.pathname.startsWith("/admin")) return;                // admin untouched
  if (url.pathname.startsWith("/r/")) return;                   // referral redirects untouched

  // Page loads: always network. Offline page only if the network fails.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  // Hashed build files and icons: cache-first.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
  }
});
