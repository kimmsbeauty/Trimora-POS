import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "analytics") --
// mechanical extraction only, JSX body below is byte-identical to the
// original inline block, no logic changes. revenueByMonth/salonsByMonth/
// revenueBySalon and fmt are passed down as the same values the parent
// already owned there.
export default function AnalyticsView({
  setView, analyticsLoading,
  revenueByMonth, salonsByMonth, revenueBySalon, fmt,
}) {
  var revMonthly  = revenueByMonth();
  var salonMonthly = salonsByMonth();
  var revBySalon  = revenueBySalon();
  var maxRev      = Math.max.apply(null, revMonthly.map(function(r) { return r.value; }).concat([1]));
  var maxSalonRev = Math.max.apply(null, revBySalon.map(function(r) { return r.value; }).concat([1]));

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("salons"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>📊 Platform Analytics</div>
      </div>

      <div style={{ padding: 16 }}>
        {analyticsLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : (
          <div>
            {/* Revenue by month */}
            <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 12 }}>Revenue by Month</div>
              {revMonthly.length === 0 ? (
                <div style={{ fontSize: 12, color: "#999" }}>No payments recorded yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {revMonthly.map(function(r) {
                    return (
                      <div key={r.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 3 }}>
                          <span>{r.label}</span>
                          <span style={{ fontWeight: 800, color: DARK }}>{fmt(r.value)}</span>
                        </div>
                        <div style={{ background: CREAM, borderRadius: 6, height: 8, overflow: "hidden" }}>
                          <div style={{ background: GOLD, height: "100%", width: (r.value / maxRev * 100) + "%", borderRadius: 6 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Salon growth by month */}
            <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 12 }}>New Salons by Month</div>
              {salonMonthly.length === 0 ? (
                <div style={{ fontSize: 12, color: "#999" }}>No salons yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {salonMonthly.map(function(r) {
                    return (
                      <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
                        <span style={{ color: "#666" }}>{r.label}</span>
                        <span style={{ fontWeight: 800, color: DARK }}>{r.value} {r.value === 1 ? "salon" : "salons"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Revenue by salon — top payers */}
            <div style={{ background: WHITE, borderRadius: 14, padding: 16, border: "1.5px solid " + GOLD_DIM + "33" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 12 }}>Revenue by Salon</div>
              {revBySalon.length === 0 ? (
                <div style={{ fontSize: 12, color: "#999" }}>No payments recorded yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {revBySalon.map(function(r) {
                    return (
                      <div key={r.salonId}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 3 }}>
                          <span>{r.number ? "#" + String(r.number).padStart(3,"0") + " " : ""}{r.name}</span>
                          <span style={{ fontWeight: 800, color: DARK }}>{fmt(r.value)}</span>
                        </div>
                        <div style={{ background: CREAM, borderRadius: 6, height: 8, overflow: "hidden" }}>
                          <div style={{ background: GOLD_DIM, height: "100%", width: (r.value / maxSalonRev * 100) + "%", borderRadius: 6 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
