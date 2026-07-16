import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM, GREEN, RED } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "carwashes") --
// mechanical extraction only, JSX body below is byte-identical to the
// original inline block, no logic changes. PRODUCTS and Badge are
// module-level values/components owned by the parent, threaded through
// as props rather than duplicated here.
export default function CarWashesView({
  salons, view, setView, PRODUCTS, Badge,
  loadAutoAnalytics, loadAuditLog, loadAutoOnboardingRequests, setCombinedPLBackTo,
  setManualModuleKey, setManualModal, setManualDone,
  setInviteModuleKey, setInviteModal, setInviteLink, setInviteEmail, setInviteName,
  openSalonDetail, actionLoading, toggleAutoModule,
  addExistingSalonId, setAddExistingSalonId,
}) {
  var onboardedCarWashes = salons.filter(function(s) { return s.auto_enabled; });
  var notYetOnboarded = salons.filter(function(s) { return !s.auto_enabled; });

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("salons"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>🚗 Car Washes (Trimora Auto)</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2, marginBottom: 10 }}>
          {onboardedCarWashes.length} onboarded car wash{onboardedCarWashes.length === 1 ? "" : "es"} · use + Onboard or + Invite below to add a new one
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PRODUCTS.map(function(p) {
            var active = p.views.indexOf(view) !== -1;
            return (
              <button key={p.key} onClick={function() { setView(p.homeView); }} style={{
                flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                background: active ? GOLD : "rgba(255,255,255,0.08)",
                color: active ? BLACK : GOLD_DIM,
                fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}>
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="carwash-nav-scroll" style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {[
            { label: "📊 Analytics",  onClick: function() { setView("autoanalytics"); loadAutoAnalytics(); } },
            { label: "💰 P&L",        onClick: function() { setCombinedPLBackTo("carwashes"); setView("combinedpl"); } },
            { label: "📋 Audit Log",  onClick: function() { setView("autoaudit"); loadAuditLog(); } },
            { label: "🩺 Health",     onClick: function() { setView("autohealth"); } },
            { label: "🧑‍💼 Requests", onClick: function() { setView("autorequests"); loadAutoOnboardingRequests(); } },
            { label: "+ Onboard",     onClick: function() { setManualModuleKey("auto"); setManualModal(true); setManualDone(""); } },
            { label: "+ Invite",      onClick: function() { setInviteModuleKey("auto"); setInviteModal(true); setInviteLink(""); setInviteEmail(""); setInviteName(""); } },
          ].map(function(btn) {
            return (
              <button key={btn.label} className="carwash-nav-item" onClick={btn.onClick} style={{
                flexShrink: 0, background: "rgba(255,255,255,0.1)", border: "1px solid " + GOLD_DIM + "44",
                color: WHITE, borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {btn.label}
              </button>
            );
          })}
        </div>
        <style>{`
          .carwash-nav-scroll::-webkit-scrollbar { display: none; }
          @media (min-width: 640px) {
            .carwash-nav-item { flex: 1 1 0 !important; white-space: normal !important; }
          }
        `}</style>
      </div>

      <div style={{ padding: 16 }}>
        {onboardedCarWashes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#999" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🚗</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 6 }}>No car washes onboarded yet</div>
            <div style={{ fontSize: 12 }}>Use <b>+ Onboard</b> or <b>+ Invite</b> above to create one from scratch, or approve a request under <b>Requests</b>.</div>
          </div>
        ) : (
          onboardedCarWashes.map(function(s) {
            return (
              <div key={s.id} onClick={function() { openSalonDetail(s, "carwashes"); }}
                style={{ background: WHITE, borderRadius: 14, padding: 14, marginBottom: 10, border: "1.5px solid " + GOLD_DIM + "33", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      {s.salon_number && <span style={{ fontSize: 10, fontWeight: 900, color: WHITE, background: GOLD_DIM, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.03em" }}>#{String(s.salon_number).padStart(3, "0")}</span>}
                      <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{s.name}</div>
                      <Badge color={GREEN}>Onboarded</Badge>
                      {s.suspended && <Badge color={RED}>Account suspended</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      /{s.slug}
                      {s.auto_enabled_at ? " · enabled " + new Date(s.auto_enabled_at).toLocaleDateString() : ""}
                    </div>
                  </div>
                  <button
                    disabled={actionLoading}
                    onClick={function(e) { e.stopPropagation(); toggleAutoModule(s, false); }}
                    style={{
                      background: "#FEE2E2", color: RED,
                      border: "none", borderRadius: 8, padding: "8px 14px",
                      fontSize: 12, fontWeight: 800, cursor: actionLoading ? "default" : "pointer",
                      opacity: actionLoading ? 0.6 : 1,
                    }}
                  >
                    Suspend
                  </button>
                </div>
              </div>
            );
          })
        )}

        {notYetOnboarded.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid " + GOLD_DIM + "33" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              Add an existing salon instead
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={addExistingSalonId} onChange={function(e) { setAddExistingSalonId(e.target.value); }}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "44", fontSize: 13, background: WHITE }}>
                <option value="">Select a salon…</option>
                {notYetOnboarded.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
              </select>
              <button
                disabled={actionLoading || !addExistingSalonId}
                onClick={function() {
                  var target = notYetOnboarded.filter(function(s) { return s.id === addExistingSalonId; })[0];
                  if (target) { toggleAutoModule(target, true); setAddExistingSalonId(""); }
                }}
                style={{
                  background: addExistingSalonId ? GOLD_DIM : "#E5E0D5", color: addExistingSalonId ? BLACK : "#999",
                  border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 800,
                  cursor: addExistingSalonId && !actionLoading ? "pointer" : "default",
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
