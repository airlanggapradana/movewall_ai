/**
 * MoveWall AI — Service Worker (Fitur 8: PWA Offline Shell)
 * ══════════════════════════════════════════════════════════════════════════════
 * Provides offline caching for static game assets, UI shell, and scripts,
 * allowing full local game execution even when internet connection is lost.
 */

const CACHE_NAME = "movewall-v8";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./mission2.html",
  "./dashboard.html",
  "./styles.css",
  "./app.js",
  "./mission2.js",
  "./dashboard.js",
  "./session-metrics.js",
  "./adaptive-engine.js",
  "./player-tracker.js",
  "./kinematic-replay.js",
  "./sync-queue.js",
  "./manifest.json",
  "./assets/MoveWall_AI_Rehab_Logo__1_transparent.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[MoveWall SW] Pre-caching static app shell");
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[MoveWall SW] Pre-cache warning (some assets may be missing):", err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log("[MoveWall SW] Removing old cache:", key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-only for non-GET methods (POST, PUT, DELETE)
  if (req.method !== "GET") {
    return;
  }

  // Network-first for internal API calls
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(
          JSON.stringify({
            error: "Offline",
            message: "Koneksi offline. Data akan disinkronisasi saat online.",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  const offlineResponse = () =>
    new Response("Offline: sumber daya tidak tersedia di cache.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  const cacheCopy = (response) => {
    if (
      response &&
      response.status === 200 &&
      (url.origin === self.location.origin || url.hostname.includes("jsdelivr.net"))
    ) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
    }
    return response;
  };

  // Network-first for HTML navigations and app scripts/styles so updates are never
  // masked by a stale cache; fall back to cache only when the network fails.
  const isAppShell =
    req.mode === "navigate" ||
    (url.origin === self.location.origin && /\.(html|js|css|json)$/.test(url.pathname));

  if (isAppShell) {
    event.respondWith(
      fetch(req)
        .then(cacheCopy)
        .catch(() =>
          caches.match(req).then(
            (cached) =>
              cached ||
              (req.mode === "navigate" ? caches.match("./index.html") : null) ||
              offlineResponse()
          )
        )
    );
    return;
  }

  // Cache-first for CDN resources (MediaPipe vision bundles) and other static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(req).then(cacheCopy).catch(() => offlineResponse());
    })
  );
});

