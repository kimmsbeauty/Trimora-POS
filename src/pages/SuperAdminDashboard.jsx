// src/pages/SuperAdminDashboard.jsx
//
// Platform management console for Trimora Systems.
// Accessible only to the super admin account.
// Shows all salons, platform stats, and allows suspend/reactivate.

import { useState, useEffect } from "react";
import { saFetch, superAdminLogout, getSuperAdminSession } from "../lib/superAdminAuth";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, WHITE, DARK, GREEN, RED, AMBER, CREAM } from "../lib/constants";

var GOLD_LT = "#F5E6B8";

function fmt(n) {
  return "KSh " + Number(n || 0).toLocaleString();
}

function Badge({ color, children }) {
  return (
    <span style={{
      display: "inline-block",
      background: color + "22",
      color: color,
      border: "1px solid " + color + "55",
      borderRadius: 20, padding: "2px 8px",
      fontSize: 10, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {children}
    </span>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div style={{
      background: WHITE, borderRadius: 14, padding: "14px 16px",
      border: "1.5px solid " + GOLD_DIM + "33", flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: DARK }}>{value}</div>
      <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: GOLD_DIM, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function SuperAdminDashboard({ onLogout }) {
  var [view,         setView]         = useState("salons"); // "salons" | "detail"
  var [salons,       setSalons]       = useState([]);
  var [stats,        setStats]        = useState(null);
  var [selectedSalon,setSelectedSalon]= useState(null);
  var [loading,      setLoading]      = useState(true);
  var [actionLoading,setActionLoading]= useState(false);
  var [suspendModal, setSuspendModal] = useState(null);
  var [suspendReason,setSuspendReason]= useState("");
  var [paymentModal, setPaymentModal] = useState(null); // salon object
  var [payPlan,      setPayPlan]      = useState("monthly");
  var [payAmount,    setPayAmount]    = useState("");
  var [payNotes,     setPayNotes]     = useState("");
  var [paymentSaving,setPaymentSaving]= useState(false);
  var [inviteModal,  setInviteModal]  = useState(false);
  var [inviteEmail,  setInviteEmail]  = useState("");
  var [inviteName,   setInviteName]   = useState("");
  var [inviteLink,   setInviteLink]   = useState("");
  var [inviteLoading,setInviteLoading]= useState(false);
  var [search,       setSearch]       = useState("");
  var [filter,       setFilter]       = useState("all"); // "all" | "active" | "suspended"

  var session = getSuperAdminSession();

  useEffect(function() { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    var [salonRows, statsRow] = await Promise.all([
      saFetch("GET", "salon_directory", "?order=created_at.desc"),
      saFetch("GET", "platform_stats",  "?limit=1"),
    ]);
    if (salonRows) setSalons(salonRows);
    if (statsRow && statsRow[0]) setStats(statsRow[0]);
    setLoading(false);
  }

  var PLANS = {
    monthly:     { label: "Monthly",      price: 1200,  days: 30  },
    quarterly:   { label: "Quarterly",    price: 3300,  days: 90  },
    semi_annual: { label: "Semi-Annual",  price: 6000,  days: 180 },
    annual:      { label: "Annual",       price: 10800, days: 365 },
    lifetime:    { label: "Lifetime",     price: 38000, days: null },
  };

  async function recordPayment(salon, plan, amount, notes) {
    setPaymentSaving(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/record_subscription_payment", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_salon_id: salon.id,
        p_plan:     plan,
        p_amount:   parseFloat(amount),
        p_notes:    notes || null,
      }),
    });
    setPaymentSaving(false);
    if (res.ok) {
      setPaymentModal(null);
      setPayPlan("monthly");
      setPayAmount("");
      setPayNotes("");
      await loadData();
    } else {
      var err = await res.json().catch(function() { return {}; });
      alert("Failed to record payment: " + (err.message || res.status));
    }
  }

  async function generateInvite() {
    setInviteLoading(true);
    setInviteLink("");
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_invite", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_email:      inviteEmail || null,
        p_salon_name: inviteName  || null,
      }),
    });
    setInviteLoading(false);
    if (res.ok) {
      var inviteToken = await res.json();
      var link = window.location.origin + "/onboard?token=" + inviteToken;
      setInviteLink(link);
    } else {
      alert("Failed to generate invite link.");
    }
  }

  async function suspendSalon(salon, reason) {
    setActionLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/suspend_salon", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_salon_id: salon.id,
        p_reason:   reason || "Suspended by admin",
      }),
    });
    setActionLoading(false);
    if (res.ok) {
      setSuspendModal(null);
      setSuspendReason("");
      await loadData();
    } else {
      var err = await res.json().catch(function() { return {}; });
      alert("Failed to suspend salon: " + (err.message || res.status));
    }
  }

  async function reactivateSalon(salon) {
    setActionLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/reactivate_salon", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_salon_id: salon.id }),
    });
    setActionLoading(false);
    if (res.ok) {
      await loadData();
    } else {
      var err = await res.json().catch(function() { return {}; });
      alert("Failed to reactivate salon: " + (err.message || res.status));
    }
  }

  function handleLogout() {
    superAdminLogout();
    onLogout();
  }

  // Filter + search
  var filteredSalons = salons.filter(function(s) {
    var matchesFilter =
      filter === "all" ||
      (filter === "active"    && !s.suspended) ||
      (filter === "suspended" && s.suspended);
    var matchesSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // ── DETAIL VIEW ──────────────────────────────────────────────────
  if (view === "detail" && selectedSalon) {
    var s = selectedSalon;
    return (
      <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
        {/* Header */}
        <div style={{ background: BLACK, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={function() { setView("salons"); setSelectedSalon(null); }}
            style={{ background: "none", border: "none", color: GOLD, fontSize: 18, cursor: "pointer", padding: 0 }}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: GOLD }}>{s.name}</div>
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
              onClick={function() { setPaymentModal(s); setPayAmount(String(PLANS["monthly"].price)); }}
              style={{ width: "100%", background: GOLD_DIM, color: WHITE, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 900, fontSize: 13, cursor: "pointer", marginTop: 12 }}
            >
              💳 Record Payment
            </button>
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
      </div>
    );
  }

  // ── MAIN LIST VIEW ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>

      {/* Header */}
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: GOLD, letterSpacing: "0.1em" }}>TRIMORA</div>
            <div style={{ fontSize: 10, color: GOLD_DIM, letterSpacing: "0.15em" }}>SUPER ADMIN</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={function() { setInviteModal(true); setInviteLink(""); setInviteEmail(""); setInviteName(""); }}
              style={{ background: GOLD_DIM, border: "none", color: BLACK, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}
            >
              + Invite
            </button>
            <button
              onClick={handleLogout}
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid " + GOLD_DIM + "44", color: GOLD_DIM, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}
            >
              Sign Out
            </button>
          </div>
        </div>
        {session && <div style={{ fontSize: 10, color: GOLD_DIM + "88", marginTop: 4 }}>{session.email}</div>}
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* Platform Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <StatCard icon="🏪" label="Total Salons"   value={stats.total_salons}   sub={stats.active_salons + " active"} />
            <StatCard icon="💰" label="Platform Revenue" value={fmt(stats.total_revenue)} />
            <StatCard icon="🛒" label="Total Sales"    value={stats.total_sales} />
            <StatCard icon="👤" label="Total Customers" value={stats.total_customers} />
          </div>
        )}

        {/* Search + filter */}
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={function(e) { setSearch(e.target.value); }}
            placeholder="Search salons..."
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: WHITE, padding: "10px 14px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {["all", "active", "suspended"].map(function(f) {
              return (
                <button key={f} onClick={function() { setFilter(f); }}
                  style={{ flex: 1, background: filter === f ? GOLD_DIM : WHITE, color: filter === f ? WHITE : "#888", border: "1.5px solid " + (filter === f ? GOLD_DIM : "#ddd"), borderRadius: 8, padding: "7px 0", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "capitalize" }}>
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Salon list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : filteredSalons.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>No salons found</div>
        ) : filteredSalons.map(function(s) {
          return (
            <div key={s.id}
              onClick={function() { setSelectedSalon(s); setView("detail"); }}
              style={{
                background: WHITE, borderRadius: 14, padding: "14px 16px",
                marginBottom: 10, border: "1.5px solid " + (s.suspended ? RED + "33" : GOLD_DIM + "22"),
                cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
              }}
            >
              {/* Logo or initial */}
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: (s.primary_color || GOLD_DIM) + "22",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
              }}>
                {s.logo_url
                  ? <img src={s.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={function(e) { e.target.style.display = "none"; }} />
                  : <span style={{ fontSize: 16, fontWeight: 900, color: s.primary_color || GOLD_DIM }}>{s.name.charAt(0).toUpperCase()}</span>
                }
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                <div style={{ fontSize: 10, color: "#888" }}>/{s.slug}</div>
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
                  {s.sale_count} sales · {s.customer_count} clients · {s.staff_count} staff
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                {s.suspended
                  ? <Badge color={RED}>Suspended</Badge>
                  : <Badge color={GREEN}>Active</Badge>}
                {s.subscription_plan
                  ? <Badge color={
                      s.subscription_status === "lifetime" ? GOLD_DIM :
                      s.subscription_status === "active"   ? GREEN :
                      s.subscription_status === "grace"    ? AMBER : RED
                    }>{(s.subscription_plan || "").replace("_", " ")}</Badge>
                  : <Badge color={"#aaa"}>no plan</Badge>
                }
                <span style={{ fontSize: 10, color: "#aaa" }}>→</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite modal */}
      {inviteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>🔗 Generate Invite Link</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>One-time link, expires in 7 days.</div>

            <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Prospect's Email (optional — pre-fills the form)</label>
            <input
              value={inviteEmail}
              onChange={function(e) { setInviteEmail(e.target.value); setInviteLink(""); }}
              placeholder="salon@example.com"
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 12 }}
            />

            <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Salon Name (optional — pre-fills the form)</label>
            <input
              value={inviteName}
              onChange={function(e) { setInviteName(e.target.value); setInviteLink(""); }}
              placeholder="e.g. Grace Beauty Studio"
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 16 }}
            />

            {inviteLink ? (
              <div>
                <div style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#166534", marginBottom: 6 }}>✓ Invite link ready — share this with the prospect:</div>
                  <div style={{ fontSize: 11, color: "#166534", wordBreak: "break-all", fontFamily: "monospace", background: WHITE, borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>{inviteLink}</div>
                  <button
                    onClick={function() { navigator.clipboard.writeText(inviteLink); alert("Link copied!"); }}
                    style={{ width: "100%", background: "#22C55E", color: WHITE, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                  >
                    📋 Copy Link
                  </button>
                </div>
                <button
                  onClick={function() { setInviteLink(""); setInviteEmail(""); setInviteName(""); }}
                  style={{ width: "100%", background: WHITE, color: GOLD_DIM, border: "1.5px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}
                >
                  Generate Another
                </button>
              </div>
            ) : (
              <button
                onClick={generateInvite}
                disabled={inviteLoading}
                style={{ width: "100%", background: GOLD_DIM, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer", marginBottom: 10, opacity: inviteLoading ? 0.7 : 1 }}
              >
                {inviteLoading ? "Generating..." : "Generate Invite Link →"}
              </button>
            )}

            <button
              onClick={function() { setInviteModal(false); setInviteLink(""); setInviteEmail(""); setInviteName(""); }}
              style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid #ddd", borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        </div>
      )}

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
                setPayAmount(String(PLANS[e.target.value].price));
              }}
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 12 }}
            >
              {Object.entries(PLANS).map(function([key, plan]) {
                return <option key={key} value={key}>{plan.label} — KES {plan.price.toLocaleString()}{plan.days ? " / " + plan.days + " days" : " (lifetime)"}</option>;
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

      {/* Suspend modal */}
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
