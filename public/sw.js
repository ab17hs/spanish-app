/**
 * Spanish Mastery — service worker.
 *
 * Strategy:
 *   - App shell + static assets: stale-while-revalidate (instant from cache,
 *     refreshed in the background).
 *   - HTML navigations: network-first with offline fallback to /offline.
 *   - API + Server Actions: network only (we never want to serve stale
 *     mutations from cache; SRS state and exam grading are not idempotent).
 *
 * Cache versioning: bump CACHE on every shipped change. Activate handler
 * sweeps any old cache buckets so the user doesn't accumulate stale chunks.
 */

const CACHE = "spanish-mastery-v2";
const SHELL = [
  "/",
  "/dashboard",
  "/study",
  "/grammar",
  "/reading",
  "/exam",
  "/settings",
  "/offline",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // addAll fails atomically — use individual adds with catch so a single
      // missing route doesn't block install.
      Promise.all(
        SHELL.map((url) =>
          c.add(url).catch((err) => console.warn("SW precache miss:", url, err)),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept mutations
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache server-action / RSC data fetches.
  if (url.pathname.startsWith("/api/") || req.headers.get("rsc")) return;

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      }),
    );
    return;
  }

  // HTML navigation: network-first, fall back to cached page or /offline.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const offline = await caches.match("/offline");
          return offline || new Response("Offline", { status: 503 });
        }),
    );
    return;
  }
});

// Listen for SKIP_WAITING from the page to activate a queued update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
