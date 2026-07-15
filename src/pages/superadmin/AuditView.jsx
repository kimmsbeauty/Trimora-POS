import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "audit") -- mechanical
// extraction only, JSX body below is byte-identical to the original inline
// block, no logic changes.
export default function AuditView({ auditLoading, auditLog, salons, setView }) {
  var actionLabels = {
    suspend_salon:        { icon: "⛔", label: "Suspended salon" },
    reactivate_salon:     { icon: "✓",  label: "Reactivated salon" },
    record_payment:       { icon: "💰", label: "Recorded payment" },
    reset_pin:            { icon: "🔑", label: "Reset PIN" },
    edit_salon_details:   { icon: "✏️", label: "Edited salon details" },
    manual_onboard:       { icon: "🏪", label: "Manually onboarded salon" },
    generate_invite:      { icon: "📨", label: "Generated invite link" },
    manual_onboard_auto:  { icon: "🚗", label: "Manually onboarded car wash" },
    generate_invite_auto: { icon: "🚗", label: "Generated Auto invite link" },
    update_plan_price:    { icon: "💲", label: "Updated plan price" },
    enable_auto_module:   { icon: "🚗", label: "Onboarded salon into Auto" },
    disable_auto_module:  { icon: "🚫", label: "Suspended salon's Auto access" },
  };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("salons"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>📋 Audit Log</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>Most recent 200 actions</div>
      </div>

      <div style={{ padding: 16 }}>
        {auditLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : auditLog.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>No actions logged yet.</div>
        ) : (
          auditLog.map(function(entry) {
            var meta = actionLabels[entry.action] || { icon: "•", label: entry.action };
            return (
              <div key={entry.id} style={{ background: WHITE, borderRadius: 12, padding: 14, marginBottom: 8, border: "1.5px solid " + GOLD_DIM + "33" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>
                    {meta.icon} {meta.label}
                    {entry.salon_name && (
                      <span style={{ color: GOLD_DIM }}>
                        {" · "}
                        {(function() { var s = salons.find(function(x) { return x.id === entry.salon_id; }); return s && s.salon_number ? "#" + String(s.salon_number).padStart(3,"0") + " " : ""; })()}
                        {entry.salon_name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#999", whiteSpace: "nowrap", marginLeft: 8 }}>
                    {new Date(entry.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {entry.details && (
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{entry.details}</div>
                )}
                <div style={{ fontSize: 10, color: "#aaa" }}>by {entry.admin_email || "unknown"}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
