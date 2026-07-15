import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "plans") -- mechanical
// extraction only, JSX body below is byte-identical to the original inline
// block, no logic changes. updatePlanPrice is passed down as the same
// function reference the parent already owned there.
export default function PlansView({
  plansLoading, plans, planEditing, planEditValue, planError, planSaving,
  setView, setPlanEditing, setPlanEditValue, setPlanError, updatePlanPrice,
}) {
  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("salons"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>💲 Subscription Plans</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>Changes apply immediately — salons see the new price next time they load Settings</div>
      </div>

      <div style={{ padding: 16 }}>
        {plansLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : plans.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>No plans found.</div>
        ) : (
          plans.map(function(plan) {
            var isEditing = planEditing === plan.key;
            return (
              <div key={plan.key} style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 10, border: "1.5px solid " + GOLD_DIM + "33" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isEditing ? 12 : 0 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{plan.label}</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                      {plan.period_days ? plan.period_days + " days" : "Forever"}
                      {plan.save_label ? " · " + plan.save_label : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {!isEditing && (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>KES {plan.price_kes.toLocaleString()}</div>
                        <button
                          onClick={function() { setPlanEditing(plan.key); setPlanEditValue(String(plan.price_kes)); setPlanError(""); }}
                          style={{ background: WHITE, border: "1.5px solid " + GOLD_DIM, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", color: DARK }}
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>New Price (KES)</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="number" min="0"
                        value={planEditValue}
                        onChange={function(e) { setPlanEditValue(e.target.value); setPlanError(""); }}
                        onKeyDown={function(e) { if (e.key === "Enter") updatePlanPrice(plan.key, planEditValue); if (e.key === "Escape") { setPlanEditing(null); setPlanError(""); } }}
                        autoFocus
                        style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: CREAM, padding: "11px 13px", fontSize: 16, fontWeight: 800, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK }}
                      />
                      <button
                        onClick={function() { updatePlanPrice(plan.key, planEditValue); }}
                        disabled={planSaving}
                        style={{ background: GOLD, color: BLACK, border: "none", borderRadius: 10, padding: "11px 16px", fontWeight: 900, fontSize: 13, cursor: "pointer", opacity: planSaving ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        {planSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={function() { setPlanEditing(null); setPlanError(""); }}
                        disabled={planSaving}
                        style={{ background: WHITE, color: "#888", border: "1.5px solid #ddd", borderRadius: 10, padding: "11px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                    {planError && (
                      <div style={{ color: "#991B1B", fontSize: 12, marginTop: 8, padding: "6px 10px", background: "#FEE2E2", borderRadius: 8 }}>{planError}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <div style={{ marginTop: 20, padding: "14px 16px", background: "#FEF3C7", borderRadius: 12, border: "1.5px solid #F59E0B33" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E", marginBottom: 4 }}>⚠️ Important</div>
          <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.7 }}>
            Changing a price here does not retroactively affect existing subscriptions — only what salons see when choosing or renewing a plan. The "save" labels (e.g. "Save 8%") are not auto-calculated and should be updated manually if prices change significantly.
          </div>
        </div>
      </div>
    </div>
  );
}
