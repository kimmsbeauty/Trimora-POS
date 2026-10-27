import { registerServiceWorker, __resetServiceWorkerRegistrationForTests } from "./registerServiceWorker";

function setReady(state) { Object.defineProperty(document, "readyState", { value: state, configurable: true }); }

describe("registerServiceWorker", function () {
  var register;
  beforeEach(function () {
    __resetServiceWorkerRegistrationForTests();
    register = vi.fn(function () { return Promise.resolve({}); });
    Object.defineProperty(navigator, "serviceWorker", { value: { register: register }, configurable: true });
  });
  afterEach(function () { delete navigator.serviceWorker; delete document.readyState; });

  it("registers immediately when the page has already finished loading (the usual case for these routes)", function () {
    setReady("complete");
    registerServiceWorker();
    expect(register).toHaveBeenCalledWith("/service-worker.js");
  });

  it("waits for the load event when the page is still loading", function () {
    setReady("loading");
    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("registers only once however often it is called", function () {
    setReady("complete");
    registerServiceWorker(); registerServiceWorker(); registerServiceWorker();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and does not throw, where service workers are not supported", function () {
    delete navigator.serviceWorker;
    setReady("complete");
    expect(function () { registerServiceWorker(); }).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it("logs a failed registration instead of throwing", async function () {
    setReady("complete");
    var spy = vi.spyOn(console, "error").mockImplementation(function () {});
    register.mockImplementation(function () { return Promise.reject(new Error("nope")); });
    registerServiceWorker();
    await Promise.resolve(); await Promise.resolve();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
