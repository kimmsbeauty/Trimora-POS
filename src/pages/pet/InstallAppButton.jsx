// "Install app" control for the Pet sidebar footer. Appears only when installing is possible:
//   * Android (Chrome/Edge): opens the browser's own install dialog.
//   * iPhone/iPad: shows the Share -> Add to Home Screen steps (Apple gives websites no button).
//   * Already installed, or a browser that offers no install: renders nothing.
import { useState, useEffect } from "react";
import { getInstallState, subscribe, promptInstall } from "../../lib/installPrompt";
import { SIDEBAR_FG, SIDEBAR_MUTED, FONT_BODY } from "./theme";

export default function InstallAppButton() {
  var stateState = useState(getInstallState); var status = stateState[0]; var setStatus = stateState[1];
  var openState = useState(false); var open = openState[0]; var setOpen = openState[1];
  var hintState = useState(false); var hint = hintState[0]; var setHint = hintState[1];

  useEffect(function () {
    setStatus(getInstallState()); // the event may have arrived between render and subscribe
    return subscribe(function () { setStatus(getInstallState()); });
  }, []);

  async function click() {
    if (status === "ios") { setOpen(!open); return; }
    var outcome = await promptInstall();
    if (outcome === "dismissed") setHint(true);
  }

  if (status === "hidden" && !hint) return null;

  return (
    <div style={{ margin: "0 4px 10px", fontFamily: FONT_BODY }}>
      {status !== "hidden" ? (
        <button type="button" onClick={click} aria-label="Install app" aria-expanded={status === "ios" ? open : undefined}
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", color: SIDEBAR_FG, fontFamily: FONT_BODY, textAlign: "left" }}>
          Install app on this device
        </button>
      ) : null}
      {status === "ios" && open ? (
        <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.5, color: SIDEBAR_MUTED }}>
          <li>Tap the <strong style={{ color: SIDEBAR_FG }}>Share</strong> button in Safari.</li>
          <li>Choose <strong style={{ color: SIDEBAR_FG }}>Add to Home Screen</strong>.</li>
          <li>Tap <strong style={{ color: SIDEBAR_FG }}>Add</strong>.</li>
        </ol>
      ) : null}
      {hint ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.5, color: SIDEBAR_MUTED }}>
          You can still install later from your browser menu: choose <strong style={{ color: SIDEBAR_FG }}>Install app</strong> or <strong style={{ color: SIDEBAR_FG }}>Add to Home screen</strong>.
        </p>
      ) : null}
    </div>
  );
}
