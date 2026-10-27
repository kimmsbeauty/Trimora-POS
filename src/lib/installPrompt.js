// src/lib/installPrompt.js
//
// "Install app" support. Chrome and Edge on Android announce that the app is installable with
// a one-time `beforeinstallprompt` event; that event must be caught when it fires and kept until
// the user asks to install. iPhones/iPads never fire it: installing there is done by hand from
// the Share menu, so we show instructions instead.
//
// Listening starts only when startInstallListeners() is called (Trimora Pet does this as it
// sets its manifest, which is what makes the event fire). Nothing is intercepted anywhere else,
// so the Salon/Auto POS keeps whatever install behaviour the browser gives it today.

var deferredPrompt = null;
var installed = false;
var started = false;
var subscribers = [];

function emit() { subscribers.slice().forEach(function (fn) { fn(); }); }

function onBeforeInstallPrompt(e) {
  e.preventDefault(); // hold the event so our own button can use it
  deferredPrompt = e;
  emit();
}
function onAppInstalled() {
  deferredPrompt = null;
  installed = true;
  emit();
}

export function startInstallListeners() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
}

// True when the page is already running as an installed app.
export function isStandalone() {
  if (typeof window === "undefined") return false;
  try {
    if (window.navigator.standalone === true) return true; // iOS
    return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  } catch (e) { return false; }
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  var ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS reports itself as a Mac, but a Mac has no touch screen
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

// "hidden"  nothing to offer (already installed, or this browser gives us no way to help)
// "prompt"  the browser can show its own install dialog
// "ios"     show the Share -> Add to Home Screen instructions
export function getInstallState() {
  if (installed || isStandalone()) return "hidden";
  if (deferredPrompt) return "prompt";
  if (isIos()) return "ios";
  return "hidden";
}

export function subscribe(fn) {
  subscribers.push(fn);
  return function () { subscribers = subscribers.filter(function (s) { return s !== fn; }); };
}

// Shows the browser's install dialog. Returns "accepted", "dismissed" or "unavailable".
// The saved event can be used once, so it is cleared whatever the answer.
export async function promptInstall() {
  if (!deferredPrompt) return "unavailable";
  var ev = deferredPrompt;
  deferredPrompt = null;
  emit();
  try {
    await ev.prompt();
    var choice = await ev.userChoice;
    return choice && choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch (e) {
    return "dismissed";
  }
}

// Test hook only: forget everything and detach, as on a fresh page load.
export function __resetInstallStateForTests() {
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onAppInstalled);
  }
  deferredPrompt = null; installed = false; started = false; subscribers = [];
}
