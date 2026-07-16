import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM } from "../../lib/constants";

// Platform-wide Profit & Loss: Salon-type revenue (sales.total, net of
// discounts) + Auto-type revenue (auto_jobs.total_price, net of
// discounts AND refunds -- the auto_platform_jobs/platform_stats views
// were widened this session specifically so this figure would be
// accurate, not the raw total_price that platform_stats used to sum)
// minus platform-wide expenses. `stats` is the already-fetched
// platform_stats row (loaded once at dashboard mount, same object
// AnalyticsView/AutoAnalyticsView's own numbers come from) -- no new
// fetch needed for this view.
export default function CombinedPLView({ setView, stats, fmt, backTo }) {
  var salonRevenue = (stats && stats.salon_revenue) || 0;
  var autoRevenue = (stats && stats.auto_revenue) || 0;
  var totalRevenue = salonRevenue + autoRevenue;
  var totalExpenses = (stats && stats.total_expenses) || 0;
  var netProfit = (stats && stats.net_profit) != null ? stats.net_profit : (totalRevenue - totalExpenses);
  var maxBar = Math.max(salonRevenue, autoRevenue, totalExpenses, 1);

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView(backTo || "salons"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>💰 Combined P&amp;L</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>Salon + Auto, platform-wide, all time</div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: WHITE, borderRadius: 14, padding: 20, marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Net Profit</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: netProfit >= 0 ? DARK : "#B91C1C" }}>{fmt(netProfit)}</div>
        </div>

        <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 12 }}>Revenue by Business Type</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Salon revenue", value: salonRevenue, color: GOLD },
              { label: "Auto revenue", value: autoRevenue, color: GOLD_DIM },
            ].map(function(r) {
              return (
                <div key={r.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 3 }}>
                    <span>{r.label}</span>
                    <span style={{ fontWeight: 800, color: DARK }}>{fmt(r.value)}</span>
                  </div>
                  <div style={{ background: CREAM, borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{ background: r.color, height: "100%", width: (r.value / maxBar * 100) + "%", borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, color: DARK, marginTop: 14, paddingTop: 10, borderTop: "1px solid " + GOLD_DIM + "22" }}>
            <span>Total revenue</span><span>{fmt(totalRevenue)}</span>
          </div>
        </div>

        <div style={{ background: WHITE, borderRadius: 14, padding: 16, border: "1.5px solid " + GOLD_DIM + "33" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 12 }}>Expenses</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666" }}>
            <span>Total expenses (all salons)</span>
            <span style={{ fontWeight: 800, color: "#B91C1C" }}>−{fmt(totalExpenses)}</span>
          </div>
          <div style={{ fontSize: 10, color: "#999", marginTop: 10 }}>
            Revenue figures net out discounts on both sides and refunds on the Auto side -- these are
            what each business actually kept, not what was charged before any adjustment.
          </div>
        </div>
      </div>
    </div>
  );
}
