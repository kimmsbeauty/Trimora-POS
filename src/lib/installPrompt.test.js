import {
  startInstallListeners, getInstallState, promptInstall, subscribe, isStandalone, isIos, __resetInstallStateForTests,
} from "./installPrompt";

// A stand-in for Chrome's one-time install offer.
function offer(outcome, opts) {
  opts = opts || {};
  var ev = new Event("beforeinstallprompt", { cancelable: true });
  ev.prompt = vi.fn(function () { return opts.reject ? Promise.reject(new Error("blocked")) : Promise.resolve(); });
  ev.userChoice = Promise.resolve({ outcome: outcome || "accepted" });
  window.dispatchEvent(ev);
  return ev;
}
// jsdom lacks some navigator properties, so override them as plain properties and remove them afterwards.
function setUa(ua, platform, touch) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "platform", { value: platform || "", configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: touch || 0, configurable: true });
}
function clearUa() { delete window.navigator.userAgent; delete window.navigator.platform; delete window.navigator.maxTouchPoints; }
var IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
var ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
var MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";

describe("installPrompt", function () {
  beforeEach(function () { __resetInstallStateForTests(); setUa(ANDROID, "Linux armv8l", 5); delete window.matchMedia; delete window.navigator.standalone; });
  afterEach(function () { clearUa(); });

  it("ignores the browser's offer until it is told to listen, leaving other pages' behaviour alone", function () {
    var ev = offer("accepted");
    expect(ev.defaultPrevented).toBe(false);
    expect(getInstallState()).toBe("hidden");
  });

  it("holds the offer once listening, so a button can use it later", function () {
    startInstallListeners();
    var ev = offer("accepted");
    expect(ev.defaultPrevented).toBe(true);
    expect(getInstallState()).toBe("prompt");
  });

  it("starts listening only once however often it is called", function () {
    startInstallListeners(); startInstallListeners(); startInstallListeners();
    var seen = 0; subscribe(function () { seen += 1; });
    offer("accepted");
    expect(seen).toBe(1);
  });

  it("shows the browser's install dialog and reports acceptance, and the offer cannot be reused", async function () {
    startInstallListeners();
    var ev = offer("accepted");
    expect(await promptInstall()).toBe("accepted");
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(getInstallState()).toBe("hidden");
    expect(await promptInstall()).toBe("unavailable");
    expect(ev.prompt).toHaveBeenCalledTimes(1);
  });

  it("reports a refusal, and a dialog that could not be shown, as dismissed", async function () {
    startInstallListeners();
    offer("dismissed");
    expect(await promptInstall()).toBe("dismissed");
    offer("accepted", { reject: true });
    expect(await promptInstall()).toBe("dismissed");
  });

  it("reports unavailable when there is no offer", async function () {
    startInstallListeners();
    expect(await promptInstall()).toBe("unavailable");
  });

  it("hides everything once the app has been installed", function () {
    startInstallListeners();
    offer("accepted");
    window.dispatchEvent(new Event("appinstalled"));
    expect(getInstallState()).toBe("hidden");
  });

  it("offers nothing when already running as an installed app", function () {
    startInstallListeners();
    offer("accepted");
    window.matchMedia = vi.fn(function () { return { matches: true }; });
    expect(isStandalone()).toBe(true);
    expect(getInstallState()).toBe("hidden");
    window.matchMedia = vi.fn(function () { return { matches: false }; });
    expect(getInstallState()).toBe("prompt");
    window.navigator.standalone = true; // iOS home-screen app
    expect(getInstallState()).toBe("hidden");
  });

  it("gives iPhones and iPads step-by-step instructions, since they never send the offer", function () {
    setUa(IPHONE, "iPhone", 5);
    expect(isIos()).toBe(true);
    expect(getInstallState()).toBe("ios");
    setUa(MAC, "MacIntel", 5); // iPadOS pretends to be a Mac but has a touch screen
    expect(isIos()).toBe(true);
    setUa(MAC, "MacIntel", 0); // a real Mac does not
    expect(isIos()).toBe(false);
    expect(getInstallState()).toBe("hidden");
  });

  it("offers nothing on a browser that gives no way to install", function () {
    startInstallListeners();
    expect(getInstallState()).toBe("hidden");
  });

  it("lets a listener stop listening", function () {
    startInstallListeners();
    var n = 0; var stop = subscribe(function () { n += 1; });
    offer("accepted"); expect(n).toBe(1);
    stop();
    window.dispatchEvent(new Event("appinstalled")); expect(n).toBe(1);
  });
});
