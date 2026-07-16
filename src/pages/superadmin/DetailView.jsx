import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM, GREEN, RED, AMBER } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "detail" && selectedSalon)
// -- mechanical extraction only, JSX body below is byte-identical to the
// original inline block, no logic changes. Badge, StatCard, fmt, and PLANS
// are module-level values/derived values the parent already owned there,
// threaded through as props rather than duplicated. All handlers/state are
// passed down unchanged (props-only, not a context migration).
//
// The suspend-salon modal JSX (suspendModal/suspendReason/suspendSalon) was
// relocated into this component in a later commit -- it originally lived in
// SuperAdminDashboard.jsx's own (default salons-list-view) return tree, a
// separate render tree from this one, so it could never actually render:
// setSuspendModal(s) is only ever called from the "Suspend Salon" button
// below, which only exists on this page. Identical bug class, and fix, to
// the payment modal earlier in this file.
export default function DetailView({
  selectedSalon, setView, detailReturnView, setSelectedSalon,
  Badge, StatCard, fmt, PLANS,
  setPaymentModal, setPayAmount,
  historyLoading, paymentHistory,
  openEditModal,
  setResetPinModal, setResetPinRole, setResetPinValue, setResetPinConfirm, setResetPinError,
  reactivateSalon, actionLoading, setSuspendModal,
  paymentModal, payPlan, setPayPlan, payAmount, payNotes, setPayNotes, paymentSaving, recordPayment,
  suspendModal, suspendReason, setSuspendReason, suspendSalon,
}) {
  var s = selectedSalon;
  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      {/* Header */}
      <div style={{ background: BLACK, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={function() { setView(detailReturnView); setSelectedSalon(null); }}
          style={{ background: "none", border: "none", color: GOLD, fontSize: 18, cursor: "pointer", padding: 0 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {s.salon_number && <span style={{ fontSize: 11, fontWeight: 900, color: GOLD_DIM, background: "rgba(201,168,76,0.15)", borderRadius: 8, padding: "3px 10px" }}>#{String(s.salon_number).padStart(3, "0")}</span>}
          <div style={{ fontSize: 14, fontWeight: 900, color: GOLD }}>{s.name}</div>
        </div>
          <div style={{ fontSize: 11, color: GOLD_DIM }}>/{s.slug}</div>
        </div>
        {s.suspended
          ? <Badge color={RED}>Suspended</Badge>
          : <Badge color={GREEN}>Active</Badge>}
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* Subscription status */}
        <div style={{ background: WHITE, borderRadius: 14, padding: "14px 16px", marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: DARK, marginBottom: 10 }}>Subscription</div>
          {s.subscription_plan ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: DARK, textTransform: "capitalize" }}>
                  {(s.subscription_plan || "").replace("_", " ")}
                </span>
                <Badge color={
                  s.subscription_status === "lifetime" ? GOLD_DIM :
                  s.subscription_status === "active"   ? GREEN :
                  s.subscription_status === "grace"    ? AMBER : RED
                }>
                  {s.subscription_status || "unknown"}
                </Badge>
              </div>
              {s.subscription_expires_at && (
                <div style={{ fontSize: 11, color: "#888" }}>
                  {new Date(s.subscription_expires_at) > new Date()
                    ? "Expires: " + new Date(s.subscription_expires_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
                    : "Expired: " + new Date(s.subscription_expires_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
                  }
                </div>
              )}
              {s.subscription_status === "lifetime" && (
                <div style={{ fontSize: 11, color: GOLD_DIM, fontWeight: 700 }}>✓ Lifetime access — never expires</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#aaa" }}>No subscription recorded yet</div>
          )}
          <button
            onClick={function() { setPaymentModal(s); setPayAmount(String(PLANS["monthly"].price_kes)); }}
            style={{ width: "100%", background: GOLD_DIM, color: WHITE, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 900, fontSize: 13, cursor: "pointer", marginTop: 12 }}
          >
            💳 Record Payment
          </button>
        </div>

        {/* Payment history */}
        <div style={{ background: WHITE, borderRadius: 14, padding: "14px 16px", marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: DARK, marginBottom: 10 }}>Payment History</div>
          {historyLoading ? (
            <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 10 }}>Loading...</div>
          ) : paymentHistory.length === 0 ? (
            <div style={{ fontSize: 12, color: "#aaa" }}>No payments recorded yet.</div>
          ) : paymentHistory.map(function(p, i) {
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < paymentHistory.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: DARK, textTransform: "capitalize" }}>{(p.plan || "").replace("_", " ")}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>{new Date(p.payment_date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</div>
                  {p.notes && <div style={{ fontSize: 10, color: "#888", fontStyle: "italic" }}>{p.notes}</div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: GREEN }}>KES {Number(p.amount).toLocaleString()}</div>
              </div>
            );
          })}
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <StatCard icon="💰" label="Total Revenue"  value={fmt(s.total_revenue)} />
          <StatCard icon="🛒" label="Total Sales"    value={s.sale_count} />
          <StatCard icon="👤" label="Customers"      value={s.customer_count} />
          <StatCard icon="👥" label="Staff"          value={s.staff_count} />
          <StatCard icon="✂️" label="Services"       value={s.service_count} />
          <StatCard icon="📅" label="Member Since"   value={new Date(s.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })} />
        </div>

        {/* Config status */}
        <div style={{ background: WHITE, borderRadius: 14, padding: "14px 16px", marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: DARK, marginBottom: 10 }}>Configuration Status</div>
          {[
            { label: "Logo set",         done: !!s.logo_url },
            { label: "M-Pesa till",      done: !!s.mpesa_till, value: s.mpesa_till },
            { label: "Contact phone",    done: !!s.contact_phone, value: s.contact_phone },
            { label: "Brand color",      done: !!s.primary_color },
            { label: "Has staff",        done: s.staff_count > 0 },
            { label: "Has services",     done: s.service_count > 0 },
          ].map(function(item) {
            return (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: 12, color: "#555" }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: item.done ? GREEN : "#ccc" }}>
                  {item.done ? (item.value || "✓") : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Links */}
        <div style={{ background: WHITE, borderRadius: 14, padding: "14px 16px", marginBottom: 14, border: "1.5px solid " + GOLD_DIM + "33" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: DARK, marginBottom: 10 }}>Quick Links</div>
          {[
            { label: "🛒 POS",           url: "/" + s.slug + "/pos" },
            { label: "📅 Booking Page",  url: "/" + s.slug + "/booking" },
          ].map(function(link) {
            return (
              <a key={link.label} href={link.url} target="_blank" rel="noreferrer"
                style={{ display: "block", padding: "8px 0", fontSize: 13, color: GOLD_DIM, fontWeight: 700, textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}>
                {link.label} ↗
              </a>
            );
          })}
        </div>

        {/* Edit Salon Details — branding/contact/M-Pesa, without
            needing to log in as the salon owner */}
        <button
          onClick={function() { openEditModal(s); }}
          style={{ width: "100%", background: WHITE, color: DARK, border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "12px 0", fontWeight: 800, fontSize: 13, cursor: "pointer", marginBottom: 10 }}
        >
          ✏️ Edit Salon Details
        </button>

        {/* Reset Admin/Staff PIN — last-resort recovery when owner
            has lost their PIN AND lost access to their reset email */}
        <button
          onClick={function() { setResetPinModal(s); setResetPinRole("admin"); setResetPinValue(""); setResetPinConfirm(""); setResetPinError(""); }}
          style={{ width: "100%", background: WHITE, color: DARK, border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "12px 0", fontWeight: 800, fontSize: 13, cursor: "pointer", marginBottom: 10 }}
        >
          🔑 Reset Admin/Staff PIN
        </button>

        {/* Suspend / Reactivate */}
        {s.suspended ? (
          <div>
            <div style={{ background: "#FEE2E2", borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#991B1B" }}>
              <b>Suspended:</b> {s.suspended_reason || "No reason given"}<br />
              <span style={{ fontSize: 10, color: "#B91C1C" }}>Since {s.suspended_at ? new Date(s.suspended_at).toLocaleDateString() : "unknown"}</span>
            </div>
            <button
              onClick={function() { reactivateSalon(s); }}
              disabled={actionLoading}
              style={{ width: "100%", background: GREEN, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
            >
              {actionLoading ? "Reactivating..." : "✓ Reactivate Salon"}
            </button>
          </div>
        ) : (
          <button
            onClick={function() { setSuspendModal(s); }}
            style={{ width: "100%", background: RED, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer", marginTop: 4 }}
          >
            ⛔ Suspend Salon
          </button>
        )}
      </div>

    {/* Payment modal */}
    {paymentModal && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>💳 Record Payment</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{paymentModal.name}</div>

          <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Plan</label>
          <select
            value={payPlan}
            onChange={function(e) {
              setPayPlan(e.target.value);
              setPayAmount(String(PLANS[e.target.value].price_kes));
            }}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 12 }}
          >
            {Object.entries(PLANS).map(function([key, plan]) {
              return <option key={key} value={key}>{plan.label} — KES {plan.price_kes.toLocaleString()}{plan.days ? " / " + plan.days + " days" : " (lifetime)"}</option>;
            })}
          </select>

          <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Amount Paid (KES)</label>
          <input
            value={payAmount}
            onChange={function(e) { setPayAmount(e.target.value); }}
            placeholder="1200"
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 12 }}
          />

          <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Notes (optional)</label>
          <input
            value={payNotes}
            onChange={function(e) { setPayNotes(e.target.value); }}
            placeholder="e.g. M-Pesa ref ABC123"
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 16 }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={function() { recordPayment(paymentModal, payPlan, payAmount, payNotes); }}
              disabled={paymentSaving || !payAmount}
              style={{ width: "100%", background: GOLD_DIM, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer", opacity: paymentSaving || !payAmount ? 0.6 : 1 }}
            >
              {paymentSaving ? "Saving..." : "✓ Confirm Payment"}
            </button>
            <button
              onClick={function() { setPaymentModal(null); setPayPlan("monthly"); setPayAmount(""); setPayNotes(""); }}
              style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid #ddd", borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

      {suspendModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: RED, marginBottom: 6 }}>⛔ Suspend Salon</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
              You are about to suspend <b>{suspendModal.name}</b>. Their POS and booking page will be blocked immediately.
            </div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Reason (optional)</label>
            <input
              value={suspendReason}
              onChange={function(e) { setSuspendReason(e.target.value); }}
              placeholder="e.g. Non-payment, policy violation..."
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 16 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={function() { suspendSalon(suspendModal, suspendReason); }}
                disabled={actionLoading}
                style={{ width: "100%", background: RED, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
              >
                {actionLoading ? "Suspending..." : "Confirm Suspend"}
              </button>
              <button
                onClick={function() { setSuspendModal(null); setSuspendReason(""); }}
                style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid #ddd", borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
