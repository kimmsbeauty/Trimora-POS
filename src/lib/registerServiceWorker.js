// src/lib/registerServiceWorker.js
//
// Registers the app-shell service worker. Called only from POS-side
// routes (StaffRoute), not the public booking flow — customers
// booking an appointment don't need or benefit from this, and keeping
// it scoped avoids any caching surprises on the public-facing pages.

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js").catch(function (err) {
      console.error("Service worker registration failed:", err);
    });
  });
}
