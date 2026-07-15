import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM, RED, AMBER } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "autohealth") -- mechanical
// extraction only, JSX body below is byte-identical to the original inline
// block, no logic changes. autoSalonsNeedingAttention is passed down as the
// same function reference the parent already owned (closes over salons/
// audit state there) -- not reimplemented here.
export default function AutoHealthView({ autoSalonsNeedingAttention, openSalonDetail, setView }) {
  var autoFlagged = autoSalonsNeedingAttention();
  var autoSeverityColor = { high: RED, medium: AMBER, low: "#999" };
  var autoSeverityBg    = { high: "#FEE2E2", medium: "#FEF3C7", low: "#F3F4F6" };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("carwashes"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>🩺 Auto Health</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>
          {autoFlagged.length === 0 ? "All onboarded car washes look healthy." : autoFlagged.length + " car wash" + (autoFlagged.length === 1 ? "" : "es") + " need" + (autoFlagged.length === 1 ? "s" : "") + " attention"}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {autoFlagged.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
            Nothing needs attention right now.
          </div>
        ) : (
          autoFlagged.map(function(item) {
            var s = item.salon;
            return (
              <div key={s.id} onClick={function() { openSalonDetail(s, "autohealth"); }}
                style={{ background: WHITE, borderRadius: 14, padding: 14, marginBottom: 10, border: "1.5px solid " + GOLD_DIM + "33", cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "#999" }}>/{s.slug}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {item.flags.map(function(f, i) {
                    return (
                      <span key={i} style={{
                        fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 20,
                        background: autoSeverityBg[f.severity], color: autoSeverityColor[f.severity],
                      }}>
                        {f.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
