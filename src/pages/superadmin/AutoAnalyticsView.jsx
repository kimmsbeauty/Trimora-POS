import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "autoanalytics") --
// mechanical extraction only, JSX body below is byte-identical to the
// original inline block, no logic changes. autoRevenueByMonth/
// autoRevenueBySalon, fmt, and StatCard are passed down as the same
// values the parent already owned there (fmt/StatCard are plain
// module-level helpers in SuperAdminDashboard.jsx, threaded through as
// props rather than duplicated here).
export default function AutoAnalyticsView({
  setView, autoAnalyticsLoading, allAutoJobs,
  autoRevenueByMonth, autoRevenueBySalon, fmt, StatCard,
}) {
  var autoRevMonthly  = autoRevenueByMonth();
  var autoRevBySalon  = autoRevenueBySalon();
  var autoMaxRev      = Math.max.apply(null, autoRevMonthly.map(function(r) { return r.value; }).concat([1]));
  var autoMaxSalonRev = Math.max.apply(null, autoRevBySalon.map(function(r) { return r.value; }).concat([1]));
  var autoTotalRevenue = allAutoJobs.reduce(function(a, j) { return a + Number(j.total_price || 0); }, 0);

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("carwashes"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>📊 Auto Analytics</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>Across all onboarded car washes · completed jobs only</div>
      </div>

      <div style={{ padding: 16 }}>
        {autoAnalyticsLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 14 }}>
              <StatCard icon="💰" label="Total Auto Revenue" value={fmt(autoTotalRevenue)} sub={allAutoJobs.length + " completed jobs"} />
            </div>

            <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 12 }}>Auto Revenue by Month</div>
              {autoRevMonthly.length === 0 ? (
                <div style={{ fontSize: 12, color: "#999" }}>No completed jobs yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {autoRevMonthly.map(function(r) {
                    return (
                      <div key={r.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 3 }}>
                          <span>{r.label}</span>
                          <span style={{ fontWeight: 800, color: DARK }}>{fmt(r.value)}</span>
                        </div>
                        <div style={{ background: CREAM, borderRadius: 6, height: 8, overflow: "hidden" }}>
                          <div style={{ background: GOLD, height: "100%", width: (r.value / autoMaxRev * 100) + "%", borderRadius: 6 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ background: WHITE, borderRadius: 14, padding: 16, border: "1.5px solid " + GOLD_DIM + "33" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 12 }}>Auto Revenue by Salon</div>
              {autoRevBySalon.length === 0 ? (
                <div style={{ fontSize: 12, color: "#999" }}>No completed jobs yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {autoRevBySalon.map(function(r) {
                    return (
                      <div key={r.salonId}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 3 }}>
                          <span>{r.name}</span>
                          <span style={{ fontWeight: 800, color: DARK }}>{fmt(r.value)}</span>
                        </div>
                        <div style={{ background: CREAM, borderRadius: 6, height: 8, overflow: "hidden" }}>
                          <div style={{ background: GOLD_DIM, height: "100%", width: (r.value / autoMaxSalonRev * 100) + "%", borderRadius: 6 }} />
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
