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
  var [resetPinModal, setResetPinModal] = useState(null);
  var [resetPinRole, setResetPinRole] = useState("admin");
  var [resetPinValue, setResetPinValue] = useState("");
  var [resetPinConfirm, setResetPinConfirm] = useState("");
  var [resetPinError, setResetPinError] = useState("");
  var [analyticsLoading, setAnalyticsLoading] = useState(false);
  var [allPayments, setAllPayments] = useState([]);
  var [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  var [editModal, setEditModal] = useState(null);
  var [editFields, setEditFields] = useState({});
  var [editSaving, setEditSaving] = useState(false);
  var [editError, setEditError] = useState("");
  var [auditLog, setAuditLog] = useState([]);
  var [auditLoading, setAuditLoading] = useState(false);
  var [auditLoaded, setAuditLoaded] = useState(false);
  var [paymentHistory, setPaymentHistory] = useState([]);
  var [historyLoading, setHistoryLoading] = useState(false);
  var [paymentModal, setPaymentModal] = useState(null);
  var [payPlan,      setPayPlan]      = useState("monthly");
  var [payAmount,    setPayAmount]    = useState("");
  var [payNotes,     setPayNotes]     = useState("");
  var [paymentSaving,setPaymentSaving]= useState(false);
  var [inviteModal,  setInviteModal]  = useState(false);
  var [inviteEmail,  setInviteEmail]  = useState("");
  var [inviteName,   setInviteName]   = useState("");
  var [inviteLink,   setInviteLink]   = useState("");
  var [inviteLoading,setInviteLoading]= useState(false);
  var [manualModal,  setManualModal]  = useState(false);
  var [manualName,   setManualName]   = useState("");
  var [manualEmail,  setManualEmail]  = useState("");
  var [manualPass,   setManualPass]   = useState("");
  var [manualStaff,  setManualStaff]  = useState("");
  var [manualAdmin,  setManualAdmin]  = useState("");
  var [manualLoading,setManualLoading]= useState(false);
  var [manualDone,   setManualDone]   = useState("");
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

  // Fire-and-forget audit log call — never blocks or fails the
  // actual action it's logging. If logging itself fails (network
  // blip, etc.) the underlying suspend/reset/edit/etc. has already
  // succeeded and should not be rolled back or reported as an error
  // to the admin over a logging hiccup.
  async function logAction(action, salonId, salonName, details) {
    try {
      var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
      await fetch(SUPABASE_URL + "/rest/v1/rpc/log_admin_action", {
        method: "POST",
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_action:     action,
          p_salon_id:   salonId || null,
          p_salon_name: salonName || null,
          p_details:    details || null,
        }),
      });
    } catch (e) {
      console.error("Audit log failed (non-fatal):", e);
    }
  }

  // Loaded once, lazily, only when Audit Log is opened.
  async function loadAuditLog() {
    if (auditLoaded) return;
    setAuditLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/get_admin_audit_log", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_limit: 200 }),
    });
    if (res.ok) {
      var rows = await res.json();
      setAuditLog(rows || []);
    }
    setAuditLoaded(true);
    setAuditLoading(false);
  }

  // Loaded once, lazily, only when Analytics is opened — avoids
  // pulling the full payment history on every dashboard visit.
  async function loadAnalytics() {
    if (analyticsLoaded) return;
    setAnalyticsLoading(true);
    var rows = await saFetch("GET", "salon_subscription_payments", "?order=payment_date.asc");
    if (rows) setAllPayments(rows);
    setAnalyticsLoaded(true);
    setAnalyticsLoading(false);
  }

  // ── Client-side aggregation — no new views/RPCs needed, just
  //    groups the raw payment rows we already have access to. ──

  function revenueByMonth() {
    var map = {};
    allPayments.forEach(function(p) {
      var d = new Date(p.payment_date);
      var key = d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
      map[key] = (map[key] || 0) + Number(p.amount || 0);
    });
    return Object.keys(map).map(function(k) { return { label: k, value: map[k] }; });
  }

  function salonsByMonth() {
    var map = {};
    salons.forEach(function(s) {
      if (!s.created_at) return;
      var d = new Date(s.created_at);
      var key = d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
      map[key] = (map[key] || 0) + 1;
    });
    return Object.keys(map).map(function(k) { return { label: k, value: map[k] }; });
  }

  function revenueBySalon() {
    var map = {};
    allPayments.forEach(function(p) {
      map[p.salon_id] = (map[p.salon_id] || 0) + Number(p.amount || 0);
    });
    var rows = Object.keys(map).map(function(salonId) {
      var salon = salons.find(function(s) { return s.id === salonId; });
      return { salonId: salonId, name: salon ? salon.name : "Unknown salon", value: map[salonId] };
    });
    rows.sort(function(a, b) { return b.value - a.value; });
    return rows;
  }

  // ── Health check — flags salons that likely need attention, using
  //    only fields already present on salon_directory. No new RPC
  //    or query needed. ──
  function getHealthFlags(s) {
    var flags = [];

    if (s.suspended) {
      flags.push({ severity: "high", label: "Suspended" });
    }

    if (s.subscription_expires_at && s.subscription_status !== "lifetime") {
      var expiresAt = new Date(s.subscription_expires_at);
      var daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) {
        flags.push({ severity: "high", label: "Subscription expired" });
      } else if (daysLeft <= 7) {
        flags.push({ severity: "medium", label: "Expires in " + daysLeft + " day" + (daysLeft === 1 ? "" : "s") });
      }
    }

    if ((s.sale_count || 0) === 0) {
      flags.push({ severity: "medium", label: "Zero sales recorded" });
    }

    if ((s.staff_count || 0) === 0) {
      flags.push({ severity: "low", label: "No staff added" });
    }

    if ((s.service_count || 0) === 0) {
      flags.push({ severity: "low", label: "No services added" });
    }

    return flags;
  }

  function salonsNeedingAttention() {
    return salons
      .map(function(s) { return { salon: s, flags: getHealthFlags(s) }; })
      .filter(function(item) { return item.flags.length > 0; })
      .sort(function(a, b) {
        var weight = { high: 3, medium: 2, low: 1 };
        var aMax = Math.max.apply(null, a.flags.map(function(f) { return weight[f.severity]; }));
        var bMax = Math.max.apply(null, b.flags.map(function(f) { return weight[f.severity]; }));
        return bMax - aMax;
      });
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
      logAction("record_payment", salon.id, salon.name, plan + " — KSh " + amount + (notes ? " (" + notes + ")" : ""));
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

  async function manualOnboard() {
    if (!manualName || !manualEmail || !manualPass || !manualStaff || !manualAdmin) {
      return alert("Please fill in all fields.");
    }
    if (manualStaff === manualAdmin) return alert("Staff and admin PINs must be different.");
    if (!/^\d{4,6}$/.test(manualStaff) || !/^\d{4,6}$/.test(manualAdmin)) {
      return alert("PINs must be 4–6 digits.");
    }
    setManualLoading(true);
    setManualDone("");

    try {
      var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();

      // Step 1: Create Auth user via Supabase Admin API
      var signupRes = await fetch(SUPABASE_URL + "/auth/v1/admin/users", {
        method: "POST",
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email:              manualEmail.trim(),
          password:           manualPass,
          email_confirm:      true,
        }),
      });

      var signupData = await signupRes.json();

      if (!signupRes.ok) {
        setManualLoading(false);
        return alert("Failed to create user: " + (signupData.msg || signupData.error || JSON.stringify(signupData)));
      }

      var userToken = signupData.access_token;

      // If admin API doesn't return a token, sign in as the new user
      if (!userToken) {
        var signinRes = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
          method: "POST",
          headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: manualEmail.trim(), password: manualPass }),
        });
        var signinData = await signinRes.json();
        userToken = signinData.access_token;
      }

      if (!userToken) {
        setManualLoading(false);
        return alert("User created but could not get session token. Try invite link instead.");
      }

      // Step 2: Generate slug
      var base = manualName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
      var slug = base;

      // Step 3: Call complete_salon_onboarding
      var rpcRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/complete_salon_onboarding", {
        method: "POST",
        headers: {
          apikey:          SUPABASE_KEY,
          Authorization:   "Bearer " + userToken,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          p_salon_name: manualName.trim(),
          p_slug:       slug,
          p_staff_pin:  manualStaff,
          p_admin_pin:  manualAdmin,
        }),
      });

      if (!rpcRes.ok) {
        var rpcErr = await rpcRes.json().catch(function() { return {}; });
        setManualLoading(false);
        return alert("Salon setup failed: " + (rpcErr.message || JSON.stringify(rpcErr)));
      }

      setManualLoading(false);
      setManualDone("✅ " + manualName + " onboarded successfully! POS: /" + slug + "/pos");
      logAction("manual_onboard", null, manualName.trim(), "Slug: " + slug + " · Email: " + manualEmail.trim());
      setManualName(""); setManualEmail(""); setManualPass("");
      setManualStaff(""); setManualAdmin("");
      await loadData();

    } catch (e) {
      setManualLoading(false);
      alert("Error: " + e.message);
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
      logAction("generate_invite", null, inviteName || null, inviteEmail ? "Pre-filled for: " + inviteEmail : null);
    } else {
      alert("Failed to generate invite link.");
    }
  }

  async function openSalonDetail(salon) {
    setSelectedSalon(salon);
    setView("detail");
    setHistoryLoading(true);
    var history = await saFetch("GET", "salon_subscription_payments",
      "?salon_id=eq." + salon.id + "&order=payment_date.desc&limit=20");
    setPaymentHistory(history || []);
    setHistoryLoading(false);
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
      logAction("suspend_salon", salon.id, salon.name, reason || "No reason given");
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
      logAction("reactivate_salon", salon.id, salon.name, null);
      await loadData();
    } else {
      var err = await res.json().catch(function() { return {}; });
      alert("Failed to reactivate salon: " + (err.message || res.status));
    }
  }

  function openEditModal(salon) {
    setEditModal(salon);
    setEditFields({
      name:            salon.name || "",
      tagline:         salon.tagline || "",
      logo_url:        salon.logo_url || "",
      primary_color:   salon.primary_color || "#C9A84C",
      secondary_color: salon.secondary_color || "#1A1A1A",
      contact_phone:   salon.contact_phone || "",
      mpesa_till:      salon.mpesa_till || "",
      mpesa_name:      salon.mpesa_name || "",
    });
    setEditError("");
  }

  async function saveSalonEdit() {
    if (!editModal) return;
    if (!editFields.name || !editFields.name.trim()) {
      setEditError("Salon name cannot be empty.");
      return;
    }
    setEditSaving(true);
    setEditError("");

    // Goes through a SECURITY DEFINER RPC (super_admin_update_salon),
    // same pattern as every other Super Admin write (suspend, reactivate,
    // PIN reset, record payment). A raw PATCH here would likely be
    // rejected by RLS, since salon_settings/salons writes are normally
    // scoped to the owning salon's own session, which Super Admin
    // doesn't have. See supabase/sql/super_admin_update_salon.sql.
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();

    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/super_admin_update_salon", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_salon_id:        editModal.id,
        p_name:             editFields.name.trim(),
        p_tagline:          editFields.tagline || null,
        p_logo_url:         editFields.logo_url || null,
        p_primary_color:    editFields.primary_color,
        p_secondary_color:  editFields.secondary_color,
        p_contact_phone:    editFields.contact_phone || null,
        p_mpesa_till:       editFields.mpesa_till || null,
        p_mpesa_name:       editFields.mpesa_name || null,
      }),
    });

    setEditSaving(false);

    if (res.ok) {
      logAction("edit_salon_details", editModal.id, editFields.name.trim(), null);
      setEditModal(null);
      await loadData();
    } else {
      var err = await res.json().catch(function() { return {}; });
      setEditError(err.message || "Failed to save. Please try again.");
    }
  }

  async function resetSalonPin(salon, role, newPin) {
    setResetPinError("");
    if (!/^[0-9]{4,6}$/.test(newPin)) {
      setResetPinError("PIN must be 4-6 digits.");
      return;
    }
    if (newPin !== resetPinConfirm) {
      setResetPinError("PINs do not match.");
      return;
    }
    setActionLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/super_admin_reset_salon_pin", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_salon_id: salon.id,
        p_role:     role,
        p_new_pin:  newPin,
      }),
    });
    setActionLoading(false);
    if (res.ok) {
      // Deliberately NOT logging the new PIN value itself — only that
      // a reset happened, by whom (via admin_email on the log row),
      // and which role. The PIN itself stays out of any log forever.
      logAction("reset_pin", salon.id, salon.name, role + " PIN reset");
      setResetPinModal(null);
      setResetPinValue("");
      setResetPinConfirm("");
      setResetPinError("");
      alert((role === "admin" ? "Admin" : "Staff") + " PIN reset successfully for " + salon.name + ".");
    } else {
      var err = await res.json().catch(function() { return {}; });
      setResetPinError(err.message || "Failed to reset PIN (status " + res.status + ")");
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
  // ── AUDIT LOG VIEW ───────────────────────────────────────────────
  if (view === "audit") {
    var actionLabels = {
      suspend_salon:        { icon: "⛔", label: "Suspended salon" },
      reactivate_salon:     { icon: "✓",  label: "Reactivated salon" },
      record_payment:       { icon: "💰", label: "Recorded payment" },
      reset_pin:            { icon: "🔑", label: "Reset PIN" },
      edit_salon_details:   { icon: "✏️", label: "Edited salon details" },
      manual_onboard:       { icon: "🏪", label: "Manually onboarded salon" },
      generate_invite:      { icon: "📨", label: "Generated invite link" },
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
                      {entry.salon_name && <span style={{ color: GOLD_DIM }}> · {entry.salon_name}</span>}
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

  // ── HEALTH VIEW ───────────────────────────────────────────────────
  if (view === "health") {
    var flaggedSalons = salonsNeedingAttention();
    var severityColor = { high: RED, medium: AMBER, low: "#999" };
    var severityBg    = { high: "#FEE2E2", medium: "#FEF3C7", low: "#F3F4F6" };

    return (
      <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
        <div style={{ background: BLACK, padding: "16px 20px" }}>
          <button onClick={function() { setView("salons"); }}
            style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
            ← Back
          </button>
          <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>🩺 Salon Health</div>
          <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>
            {flaggedSalons.length === 0 ? "All salons look healthy." : flaggedSalons.length + " salon" + (flaggedSalons.length === 1 ? "" : "s") + " need" + (flaggedSalons.length === 1 ? "s" : "") + " attention"}
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {flaggedSalons.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              Nothing needs attention right now.
            </div>
          ) : (
            flaggedSalons.map(function(item) {
              var s = item.salon;
              return (
                <div key={s.id}
                  onClick={function() { openSalonDetail(s); }}
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
                          background: severityBg[f.severity], color: severityColor[f.severity],
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

  // ── ANALYTICS VIEW ───────────────────────────────────────────────
  if (view === "analytics") {
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
                            <span>{r.name}</span>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={function() { setView("audit"); loadAuditLog(); }}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid " + GOLD_DIM + "44", color: WHITE, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}
            >
              📋 Audit Log
            </button>
            <button
              onClick={function() { setView("health"); }}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid " + GOLD_DIM + "44", color: WHITE, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}
            >
              🩺 Health
            </button>
            <button
              onClick={function() { setView("analytics"); loadAnalytics(); }}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid " + GOLD_DIM + "44", color: WHITE, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}
            >
              📊 Analytics
            </button>
            <button
              onClick={function() { setManualModal(true); setManualDone(""); }}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid " + GOLD_DIM + "44", color: WHITE, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}
            >
              + Manual
            </button>
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
              onClick={function() { openSalonDetail(s); }}
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

      {/* Manual Onboard modal */}
      {manualModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>🏪 Manual Onboarding</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Create a salon directly without an invite link.</div>

            {[
              ["Salon Name", manualName, setManualName, "text", "e.g. Grace Beauty Studio"],
              ["Owner Email", manualEmail, setManualEmail, "email", "owner@salon.com"],
              ["Temporary Password", manualPass, setManualPass, "password", "Min 6 characters"],
            ].map(function(field) {
              return (
                <div key={field[0]} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 5, textTransform: "uppercase" }}>{field[0]}</label>
                  <input type={field[3]} value={field[1]} onChange={function(e) { field[2](e.target.value); }} placeholder={field[4]}
                    style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK }} />
                </div>
              );
            })}

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Staff PIN</label>
                <input value={manualStaff} onChange={function(e) { setManualStaff(e.target.value.replace(/\D/g, "").slice(0, 6)); }} placeholder="4–6 digits" inputMode="numeric" maxLength={6}
                  style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, textAlign: "center" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Admin PIN</label>
                <input value={manualAdmin} onChange={function(e) { setManualAdmin(e.target.value.replace(/\D/g, "").slice(0, 6)); }} placeholder="4–6 digits" inputMode="numeric" maxLength={6}
                  style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, textAlign: "center" }} />
              </div>
            </div>

            {manualDone && (
              <div style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13, color: "#166534", fontWeight: 700 }}>
                {manualDone}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={manualOnboard} disabled={manualLoading}
                style={{ width: "100%", background: DARK, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer", opacity: manualLoading ? 0.7 : 1 }}>
                {manualLoading ? "Creating salon..." : "🏪 Create Salon"}
              </button>
              <button onClick={function() { setManualModal(false); setManualDone(""); }}
                style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid #ddd", borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Edit Salon Details modal */}
      {editModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center", overflowY: "auto" }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 6 }}>✏️ Edit Salon Details</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
              Editing <b>{editModal.name}</b>. Changes apply immediately.
            </div>

            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Salon Name</label>
            <input
              value={editFields.name || ""}
              onChange={function(e) { setEditFields(Object.assign({}, editFields, { name: e.target.value })); }}
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 14 }}
            />

            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Tagline</label>
            <input
              value={editFields.tagline || ""}
              onChange={function(e) { setEditFields(Object.assign({}, editFields, { tagline: e.target.value })); }}
              placeholder="e.g. Beauty That Speaks Confidence"
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 14 }}
            />

            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Logo URL</label>
            <input
              value={editFields.logo_url || ""}
              onChange={function(e) { setEditFields(Object.assign({}, editFields, { logo_url: e.target.value })); }}
              placeholder="https://..."
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 14 }}
            />

            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Primary Color</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={editFields.primary_color || "#C9A84C"}
                    onChange={function(e) { setEditFields(Object.assign({}, editFields, { primary_color: e.target.value })); }}
                    style={{ width: 38, height: 38, border: "1.5px solid #ddd", borderRadius: 8, cursor: "pointer", padding: 2 }} />
                  <input value={editFields.primary_color || ""}
                    onChange={function(e) { setEditFields(Object.assign({}, editFields, { primary_color: e.target.value })); }}
                    style={{ flex: 1, borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "9px 10px", fontSize: 12, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Secondary Color</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={editFields.secondary_color || "#1A1A1A"}
                    onChange={function(e) { setEditFields(Object.assign({}, editFields, { secondary_color: e.target.value })); }}
                    style={{ width: 38, height: 38, border: "1.5px solid #ddd", borderRadius: 8, cursor: "pointer", padding: 2 }} />
                  <input value={editFields.secondary_color || ""}
                    onChange={function(e) { setEditFields(Object.assign({}, editFields, { secondary_color: e.target.value })); }}
                    style={{ flex: 1, borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "9px 10px", fontSize: 12, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK }} />
                </div>
              </div>
            </div>

            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Contact Phone</label>
            <input
              value={editFields.contact_phone || ""}
              onChange={function(e) { setEditFields(Object.assign({}, editFields, { contact_phone: e.target.value })); }}
              placeholder="07xxxxxxxx"
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 14 }}
            />

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>M-Pesa Till</label>
                <input
                  value={editFields.mpesa_till || ""}
                  onChange={function(e) { setEditFields(Object.assign({}, editFields, { mpesa_till: e.target.value })); }}
                  style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>M-Pesa Name</label>
                <input
                  value={editFields.mpesa_name || ""}
                  onChange={function(e) { setEditFields(Object.assign({}, editFields, { mpesa_name: e.target.value })); }}
                  style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK }}
                />
              </div>
            </div>

            {editError && (
              <div style={{ color: "#991B1B", fontSize: 12, marginBottom: 14, padding: "8px 12px", background: "#FEE2E2", borderRadius: 8 }}>{editError}</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={saveSalonEdit}
                disabled={editSaving}
                style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer", opacity: editSaving ? 0.6 : 1 }}
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={function() { setEditModal(null); setEditError(""); }}
                style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid #ddd", borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN modal — last-resort recovery for fully locked-out owners */}
      {resetPinModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 6 }}>🔑 Reset PIN</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
              Set a new PIN for <b>{resetPinModal.name}</b>. Use this only when the owner cannot use the self-service reset (e.g. no access to their email).
            </div>

            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Which PIN?</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[{ id: "admin", label: "Admin PIN" }, { id: "staff", label: "Staff PIN" }].map(function(r) {
                return (
                  <button
                    key={r.id}
                    onClick={function() { setResetPinRole(r.id); setResetPinError(""); }}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
                      border: "1.5px solid " + (resetPinRole === r.id ? GOLD : "#ddd"),
                      background: resetPinRole === r.id ? GOLD : WHITE,
                      color: resetPinRole === r.id ? BLACK : "#888",
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>New PIN (4-6 digits)</label>
            <input
              type="password" inputMode="numeric" maxLength={6}
              value={resetPinValue}
              onChange={function(e) { setResetPinValue(e.target.value.replace(/\D/g, "")); setResetPinError(""); }}
              placeholder="Enter new PIN"
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", background: CREAM, padding: "11px 13px", fontSize: 18, letterSpacing: "0.3em", textAlign: "center", boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 10 }}
            />

            <label style={{ fontSize: 11, fontWeight: 800, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Confirm PIN</label>
            <input
              type="password" inputMode="numeric" maxLength={6}
              value={resetPinConfirm}
              onChange={function(e) { setResetPinConfirm(e.target.value.replace(/\D/g, "")); setResetPinError(""); }}
              placeholder="Re-enter new PIN"
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (resetPinConfirm.length > 0 && resetPinConfirm !== resetPinValue ? "#FCA5A5" : "#ddd"), background: CREAM, padding: "11px 13px", fontSize: 18, letterSpacing: "0.3em", textAlign: "center", boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 14 }}
            />

            {resetPinError && (
              <div style={{ color: "#991B1B", fontSize: 12, marginBottom: 14, padding: "8px 12px", background: "#FEE2E2", borderRadius: 8 }}>{resetPinError}</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={function() { resetSalonPin(resetPinModal, resetPinRole, resetPinValue); }}
                disabled={actionLoading || resetPinValue.length < 4}
                style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer", opacity: (actionLoading || resetPinValue.length < 4) ? 0.6 : 1 }}
              >
                {actionLoading ? "Resetting..." : "Confirm Reset PIN"}
              </button>
              <button
                onClick={function() { setResetPinModal(null); setResetPinValue(""); setResetPinConfirm(""); setResetPinError(""); }}
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
