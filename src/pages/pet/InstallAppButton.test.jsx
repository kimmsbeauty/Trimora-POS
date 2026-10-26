import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import InstallAppButton from "./InstallAppButton";
import { startInstallListeners, __resetInstallStateForTests } from "../../lib/installPrompt";

function offer(outcome) {
  var ev = new Event("beforeinstallprompt", { cancelable: true });
  ev.prompt = vi.fn(function () { return Promise.resolve(); });
  ev.userChoice = Promise.resolve({ outcome: outcome || "accepted" });
  act(function () { window.dispatchEvent(ev); });
  return ev;
}
var IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
var ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";

// jsdom lacks some navigator properties, so override them as plain properties and remove them afterwards.
function setUa(ua, platform, touch) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: touch, configurable: true });
}

describe("InstallAppButton", function () {
  beforeEach(function () {
    __resetInstallStateForTests();
    setUa(ANDROID, "Linux armv8l", 5);
    delete window.matchMedia; delete window.navigator.standalone;
  });
  afterEach(function () { delete window.navigator.userAgent; delete window.navigator.platform; delete window.navigator.maxTouchPoints; });

  it("renders nothing until the browser says the app can be installed", function () {
    startInstallListeners();
    var view = render(<InstallAppButton />);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("appears when the browser offers installation, even if the offer arrived before the button existed", function () {
    startInstallListeners();
    offer("accepted"); // arrives on the login screen, before the button is mounted
    render(<InstallAppButton />);
    expect(screen.getByRole("button", { name: "Install app" })).toBeInTheDocument();
  });

  it("appears live when the offer arrives after the button is on screen", function () {
    startInstallListeners();
    render(<InstallAppButton />);
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
    offer("accepted");
    expect(screen.getByRole("button", { name: "Install app" })).toBeInTheDocument();
  });

  it("opens the browser's install dialog on tap and then goes away", async function () {
    startInstallListeners();
    var ev = offer("accepted");
    render(<InstallAppButton />);
    fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    await waitFor(function () { expect(ev.prompt).toHaveBeenCalledTimes(1); });
    await waitFor(function () { expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument(); });
    expect(screen.queryByText(/install later from your browser menu/i)).not.toBeInTheDocument();
  });

  it("points to the browser menu if the person declines the dialog", async function () {
    startInstallListeners();
    offer("dismissed");
    render(<InstallAppButton />);
    fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect(await screen.findByText(/install later from your browser menu/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("shows Share > Add to Home Screen steps on an iPhone, and can hide them again", function () {
    setUa(IPHONE, "iPhone", 5);
    render(<InstallAppButton />);
    var btn = screen.getByRole("button", { name: "Install app" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Add to Home Screen")).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText("Add to Home Screen")).not.toBeInTheDocument();
  });

  it("is hidden when the app is already running installed", function () {
    startInstallListeners();
    offer("accepted");
    window.matchMedia = vi.fn(function () { return { matches: true }; });
    var view = render(<InstallAppButton />);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("disappears when the app finishes installing", function () {
    startInstallListeners();
    offer("accepted");
    render(<InstallAppButton />);
    expect(screen.getByRole("button", { name: "Install app" })).toBeInTheDocument();
    act(function () { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });
});
