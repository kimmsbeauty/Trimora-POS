// src/lib/registerServiceWorker.js
//
// Registers the app-shell service worker. Called only from staff-side routes (the Salon/Auto
// POS and Trimora Pet), not the public booking flow -- customers booking an appointment don't
// need or benefit from this, and keeping it scoped avoids any caching surprises on the
// public-facing pages.
//
// These routes mount AFTER an asynchronous check (which salon, which modules), by which time
// the window "load" event has normally already fired. Waiting for a "load" that has already
// happened would mean the service worker never registers, so register straight away when the
// page has finished loading, and only wait when it has not.

var started = false;

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (started) return;
  started = true;

  function register() {
    navigator.serviceWorker.register("/service-worker.js").catch(function (err) {
      console.error("Service worker registration failed:", err);
    });
  }

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

// Test hook only: lets a test start from a clean state.
export function __resetServiceWorkerRegistrationForTests() {
  started = false;
}
