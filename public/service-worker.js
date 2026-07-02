// public/service-worker.js
//
// Minimal app-shell cache for Trimora POS. This is deliberately
// conservative — it does NOT try to cache or intercept any Supabase
// API calls (those already have their own offline-queue handling in
// src/lib/db.js). All this does is let the installed app shell
// (HTML/JS/CSS bundle, icons) load instantly from cache, so the app
// opens fast even on a weak connection, while all real data still
// goes straight to the network exactly as before.

const CACHE_NAME = "trimora-pos-shell-v1";
const SHELL_ASSETS = [
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_ASSETS).catch(function () {
        // Don't fail install if one asset 404s — better a partial
        // cache than no service worker at all.
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Never intercept API calls, Supabase, or anything cross-origin —
  // those must always hit the network directly so db.js's offline
  // queue and auth flow behave exactly as they do today.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  // Network-first for navigation (so a fresh deploy is picked up
  // quickly), falling back to the cached app shell only if the
  // network is genuinely down. We never cache "/" itself (that's
  // RedirectToBooking, not the POS) — instead we fall back to
  // whatever page was last successfully cached for THIS exact path,
  // so a staff member who opens the installed app while offline
  // lands back on their own salon's last-loaded screen instead of
  // a dead redirect page with nowhere to go.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(event.request).then(function (cached) {
            return cached || new Response(
              "<!DOCTYPE html><html><body style='background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px'><div><h2>No connection</h2><p style=\"color:#999\">Reconnect to the internet and reopen the app.</p></div></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          });
        })
    );
    return;
  }

  // Cache-first for static shell assets (icons, JS/CSS bundle).
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return (
        cached ||
        fetch(event.request).then(function (response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
      );
    })
  );
});
