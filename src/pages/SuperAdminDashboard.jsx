// src/pages/SuperAdminDashboard.jsx
//
// Platform management console for Trimora Systems.
// Accessible only to the super admin account.
// Shows all salons, platform stats, and allows suspend/reactivate.

import { useState, useEffect } from "react";
import { saFetch, superAdminLogout, getSuperAdminSession } from "../lib/superAdminAuth";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, WHITE, DARK, GREEN, RED, AMBER, CREAM, GRAY } from "../lib/constants";
import {
  getHealthFlags as getHealthFlagsLib,
  salonsNeedingAttention as salonsNeedingAttentionLib,
  revenueByMonth as revenueByMonthLib,
  salonsByMonth as salonsByMonthLib,
  revenueBySalon as revenueBySalonLib,
  autoSalonsNeedingAttention as autoSalonsNeedingAttentionLib,
  autoRevenueByMonth as autoRevenueByMonthLib,
  autoRevenueBySalon as autoRevenueBySalonLib,
} from "../lib/salonHealth.js";
import AuditView from "./superadmin/AuditView";
import AutoAuditView from "./superadmin/AutoAuditView";
import AutoHealthView from "./superadmin/AutoHealthView";
import HealthView from "./superadmin/HealthView";
import PlansView from "./superadmin/PlansView";
import AutoAnalyticsView from "./superadmin/AutoAnalyticsView";
import AnalyticsView from "./superadmin/AnalyticsView";
import CombinedPLView from "./superadmin/CombinedPLView";
import RequestsView from "./superadmin/RequestsView";
import CarWashesView from "./superadmin/CarWashesView";
import AutoRequestsView from "./superadmin/AutoRequestsView";
import DetailView from "./superadmin/DetailView";

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
  // Every product this dashboard can manage, and which `view` key(s)
  // belong to it. Adding a future product (e.g. a third industry
  // module) is just one more entry here plus its own `view === "..."`
  // block elsewhere in this file -- the switcher itself needs no
  // further changes. "salons" owns every view that isn't explicitly
  // claimed by another product, so existing views (plans/audit/
  // requests/health/analytics/detail) stay under Salons with zero
  // changes to those blocks.
  var PRODUCTS = [
    { key: "salons", label: "🏠 Salons", homeView: "salons", views: ["salons", "detail", "plans", "audit", "requests", "health", "analytics"] },
    { key: "auto",   label: "🚗 Auto",   homeView: "carwashes", views: ["carwashes", "autohealth", "autoanalytics", "autoaudit", "autorequests"] },
  ];

  var [view,         setView]         = useState("salons"); // "salons" | "detail"
  var [salons,       setSalons]       = useState([]);
  var [stats,        setStats]        = useState(null);
  var [combinedPLBackTo, setCombinedPLBackTo] = useState("salons");
  var [selectedSalon,setSelectedSalon]= useState(null);
  var [detailReturnView, setDetailReturnView] = useState("salons");
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
  var [autoAnalyticsLoading, setAutoAnalyticsLoading] = useState(false);
  var [allAutoJobs, setAllAutoJobs] = useState([]);
  var [autoAnalyticsLoaded, setAutoAnalyticsLoaded] = useState(false);
  var [editModal, setEditModal] = useState(null);
  var [editFields, setEditFields] = useState({});
  var [editSaving, setEditSaving] = useState(false);
  var [editError, setEditError] = useState("");
  var [auditLog, setAuditLog] = useState([]);
  var [auditLoading, setAuditLoading] = useState(false);
  var [auditLoaded, setAuditLoaded] = useState(false);
  var [plans, setPlans] = useState([]);
  var [plansLoaded, setPlansLoaded] = useState(false);
  var [plansLoading, setPlansLoading] = useState(false);
  var [planEditing, setPlanEditing] = useState(null);   // key of plan being edited
  var [planEditValue, setPlanEditValue] = useState(""); // new price input
  var [planSaving, setPlanSaving] = useState(false);
  var [planError, setPlanError] = useState("");
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
  var [inviteModuleKey, setInviteModuleKey] = useState(null); // null = regular salon, "auto" = car wash
  var [manualModal,  setManualModal]  = useState(false);
  var [manualName,   setManualName]   = useState("");
  var [manualEmail,  setManualEmail]  = useState("");
  var [manualModuleKey, setManualModuleKey] = useState(null); // null = regular salon, "auto" = car wash
  var [addExistingSalonId, setAddExistingSalonId] = useState("");
  var [manualPass,   setManualPass]   = useState("");
  var [manualStaff,  setManualStaff]  = useState("");
  var [manualAdmin,  setManualAdmin]  = useState("");
  var [manualLoading,setManualLoading]= useState(false);
  var [manualDone,   setManualDone]   = useState("");
  var [search,       setSearch]       = useState("");
  var [filter,       setFilter]       = useState("all"); // "all" | "active" | "suspended"
  var [onboardingRequests, setOnboardingRequests] = useState([]);
  var [requestsLoading, setRequestsLoading] = useState(false);
  var [requestsLoaded, setRequestsLoaded] = useState(false);
  var [rejectModal,  setRejectModal]  = useState(null); // request row being rejected
  var [rejectReason, setRejectReason] = useState("");
  var [autoOnboardingRequests, setAutoOnboardingRequests] = useState([]);
  var [autoRequestsLoading, setAutoRequestsLoading] = useState(false);
  var [autoRequestsLoaded, setAutoRequestsLoaded] = useState(false);
  var [autoApprovingId, setAutoApprovingId] = useState(null);
  var [autoRejectModal, setAutoRejectModal] = useState(null);
  var [autoRejectReason, setAutoRejectReason] = useState("");
  var [approvingId,  setApprovingId]  = useState(null);
  var [addRepModal,  setAddRepModal]  = useState(false);
  var [addRepEmail,  setAddRepEmail]  = useState("");
  var [addRepPass,   setAddRepPass]   = useState("");
  var [addRepLoading,setAddRepLoading]= useState(false);
  var [addRepError,  setAddRepError]  = useState("");
  var [addRepDone,   setAddRepDone]   = useState(false);

  var session = getSuperAdminSession();

  // Show a session-expired warning inside the dashboard rather than
  // letting cryptic JWT errors surface from individual action calls.
  var sessionExpired = !session;

  useEffect(function() { loadData(); loadPlans(); }, []);

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
      if (!token) return; // session expired, skip logging silently
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
    if (!token) { setAuditLoading(false); return; }
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

  // Loaded once, lazily, only when Onboarding Requests is opened.
  async function loadOnboardingRequests() {
    setRequestsLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setRequestsLoading(false); return; }
    var res = await fetch(SUPABASE_URL + "/rest/v1/salon_onboarding_requests?order=created_at.desc", {
      method: "GET",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
    });
    if (res.ok) {
      var rows = await res.json();
      setOnboardingRequests(rows || []);
    }
    setRequestsLoaded(true);
    setRequestsLoading(false);
  }

  // Approving reuses the EXISTING create_invite RPC -- no parallel path
  // to salon creation. The resulting token is stored on the request row
  // so the submitting rep can see it too (see SalesRepDashboard.jsx).
  async function approveRequest(request) {
    setApprovingId(request.id);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setApprovingId(null); alert("Session expired. Please sign out and sign in again."); return; }

    var inviteRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_invite", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ p_email: request.owner_email || null, p_salon_name: request.salon_name }),
    });

    if (!inviteRes.ok) {
      setApprovingId(null);
      alert("Failed to generate invite for this request.");
      return;
    }

    var inviteToken = await inviteRes.json();

    var updateRes = await fetch(SUPABASE_URL + "/rest/v1/salon_onboarding_requests?id=eq." + request.id, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "approved",
        reviewed_by: session.uid,
        reviewed_at: new Date().toISOString(),
        resulting_invite_token: inviteToken,
      }),
    });

    setApprovingId(null);

    if (!updateRes.ok) {
      alert("Invite was created but updating the request record failed. Invite token: " + inviteToken);
      return;
    }

    logAction("generate_invite", null, request.salon_name, "Approved onboarding request from rep, id " + request.id);
    setOnboardingRequests(function(prev) {
      return prev.map(function(r) {
        return r.id === request.id
          ? Object.assign({}, r, { status: "approved", resulting_invite_token: inviteToken })
          : r;
      });
    });
  }

  async function rejectRequest() {
    if (!rejectModal) return;
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { alert("Session expired. Please sign out and sign in again."); return; }

    var res = await fetch(SUPABASE_URL + "/rest/v1/salon_onboarding_requests?id=eq." + rejectModal.id, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "rejected",
        rejection_reason: rejectReason.trim() || null,
        reviewed_by: session.uid,
        reviewed_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) { alert("Failed to reject request."); return; }

    var rejectedId = rejectModal.id;
    setOnboardingRequests(function(prev) {
      return prev.map(function(r) {
        return r.id === rejectedId
          ? Object.assign({}, r, { status: "rejected", rejection_reason: rejectReason.trim() || null })
          : r;
      });
    });
    setRejectModal(null);
    setRejectReason("");
  }

  // ── Auto Requests (separate from salon_onboarding_requests) ─────────
  // Same three functions as above, operating on auto_onboarding_requests
  // instead. Approving passes p_module_key: "auto" to create_invite, so
  // complete_salon_onboarding auto-enables the module the moment the
  // prospect completes onboarding -- same underlying mechanism as the
  // salon flow, not a parallel implementation.
  async function loadAutoOnboardingRequests() {
    if (autoRequestsLoaded) return;
    setAutoRequestsLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setAutoRequestsLoading(false); return; }
    var res = await fetch(SUPABASE_URL + "/rest/v1/auto_onboarding_requests?order=created_at.desc", {
      method: "GET",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
    });
    if (res.ok) {
      var rows = await res.json();
      setAutoOnboardingRequests(rows || []);
    }
    setAutoRequestsLoaded(true);
    setAutoRequestsLoading(false);
  }

  async function approveAutoRequest(request) {
    setAutoApprovingId(request.id);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setAutoApprovingId(null); alert("Session expired. Please sign out and sign in again."); return; }

    var inviteRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_invite", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ p_email: request.owner_email || null, p_salon_name: request.salon_name, p_module_key: "auto" }),
    });

    if (!inviteRes.ok) {
      setAutoApprovingId(null);
      alert("Failed to generate invite for this request.");
      return;
    }

    var inviteToken = await inviteRes.json();

    var updateRes = await fetch(SUPABASE_URL + "/rest/v1/auto_onboarding_requests?id=eq." + request.id, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "approved",
        reviewed_by: session.uid,
        reviewed_at: new Date().toISOString(),
        resulting_invite_token: inviteToken,
      }),
    });

    setAutoApprovingId(null);

    if (!updateRes.ok) {
      alert("Invite was created but updating the request record failed. Invite token: " + inviteToken);
      return;
    }

    logAction("generate_invite_auto", null, request.salon_name, "Approved Auto onboarding request from rep, id " + request.id);
    setAutoOnboardingRequests(function(prev) {
      return prev.map(function(r) {
        return r.id === request.id
          ? Object.assign({}, r, { status: "approved", resulting_invite_token: inviteToken })
          : r;
      });
    });
  }

  async function rejectAutoRequest() {
    if (!autoRejectModal) return;
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { alert("Session expired. Please sign out and sign in again."); return; }

    var res = await fetch(SUPABASE_URL + "/rest/v1/auto_onboarding_requests?id=eq." + autoRejectModal.id, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "rejected",
        rejection_reason: autoRejectReason.trim() || null,
        reviewed_by: session.uid,
        reviewed_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) { alert("Failed to reject request."); return; }

    var rejectedId = autoRejectModal.id;
    setAutoOnboardingRequests(function(prev) {
      return prev.map(function(r) {
        return r.id === rejectedId
          ? Object.assign({}, r, { status: "rejected", rejection_reason: autoRejectReason.trim() || null })
          : r;
      });
    });
    setAutoRejectModal(null);
    setAutoRejectReason("");
  }

  // Creates a new sales rep account. Requires a genuine service-role
  // action (setting app_metadata isn't possible via the normal client
  // SDK, by design -- see superAdminAuth.js/salesRepAuth.js comments on
  // why app_metadata specifically, not user_metadata, is the trusted
  // gate). The admin-create-sales-rep function verifies the CALLER is a
  // superadmin itself before doing anything privileged.
  async function addSalesRep() {
    if (!addRepEmail.trim() || !addRepPass.trim()) { setAddRepError("Email and password are required."); return; }
    setAddRepLoading(true);
    setAddRepError("");
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setAddRepLoading(false); setAddRepError("Session expired. Please sign out and sign in again."); return; }

    var res = await fetch(SUPABASE_URL + "/functions/v1/admin-create-sales-rep", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ email: addRepEmail.trim(), password: addRepPass }),
    });

    var data = await res.json();
    setAddRepLoading(false);

    if (!res.ok) {
      setAddRepError(data.error || "Failed to create sales rep account.");
      return;
    }

    logAction("manual_onboard", null, null, "Created sales rep account: " + addRepEmail.trim());
    setAddRepEmail(""); setAddRepPass("");
    setAddRepDone(true);
    setTimeout(function() { setAddRepDone(false); setAddRepModal(false); }, 2000);
  }

  // Loaded once on first open — plans rarely change.
  async function loadPlans() {
    if (plansLoaded) return;
    setPlansLoading(true);
    var rows = await saFetch("GET", "subscription_plans", "?order=sort_order.asc");
    if (rows) setPlans(rows);
    setPlansLoaded(true);
    setPlansLoading(false);
  }

  async function updatePlanPrice(key, newPrice) {
    setPlanError("");
    var price = parseInt(newPrice, 10);
    if (isNaN(price) || price < 0) { setPlanError("Enter a valid price (0 or more)."); return; }
    setPlanSaving(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setPlanSaving(false); setPlanError("Session expired. Please sign out and sign in again."); return; }
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/super_admin_update_plan_price", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_price_kes: price }),
    });
    setPlanSaving(false);
    if (res.ok) {
      logAction("update_plan_price", null, null, key + " → KES " + price.toLocaleString());
      setPlanEditing(null);
      setPlanEditValue("");
      // Refresh plans list from DB so both this view and any
      // SalonSettingsPage load that happens next gets the new price.
      setPlansLoaded(false);
      var rows = await saFetch("GET", "subscription_plans", "?order=sort_order.asc");
      if (rows) setPlans(rows);
      setPlansLoaded(true);
    } else {
      var err = await res.json().catch(function() { return {}; });
      setPlanError(err.message || "Failed to update price.");
    }
  }

  // Loaded on dashboard init and after any price change.
  async function loadPlans() {
    var rows = await saFetch("GET", "subscription_plans", "?order=sort_order.asc&is_active=eq.true");
    if (rows) setPlans(rows);
    setPlansLoaded(true);
  }

  async function savePlanPrice(key, newPrice) {
    setPlanError("");
    var price = parseInt(newPrice, 10);
    if (isNaN(price) || price < 0) { setPlanError("Enter a valid price (0 or more)."); return; }
    setPlanSaving(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setPlanSaving(false); setPlanError("Session expired. Please sign out and sign in again."); return; }
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/super_admin_update_plan_price", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_price_kes: price }),
    });
    setPlanSaving(false);
    if (res.ok) {
      logAction("update_plan_price", null, null, key + " → KSh " + price.toLocaleString());
      setPlanEditing(null);
      await loadPlans();
    } else {
      var err = await res.json().catch(function() { return {}; });
      setPlanError(err.message || "Failed to save price.");
    }
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
  //    groups the raw payment rows we already have access to.
  //    Extracted to src/lib/salonHealth.js (with test coverage); these
  //    are thin wrappers so every call site below is unchanged. ──

  function revenueByMonth() {
    return revenueByMonthLib(allPayments);
  }

  // realSalons excludes car washes (business_type='auto') -- these three
  // consumers are all reached from the Salons product tab specifically
  // (Analytics, Health), so they should reflect salons only, same as
  // filteredSalons and platform_stats above. The Car Washes view and
  // its own Auto Health/Analytics continue to use the full `salons`
  // array (or auto_enabled) directly -- unaffected by this.
  var realSalons = salons.filter(function(s) { return s.business_type !== "auto"; });

  function salonsByMonth() {
    return salonsByMonthLib(realSalons);
  }

  function revenueBySalon() {
    return revenueBySalonLib(allPayments, realSalons);
  }

  // ── Health check — flags salons that likely need attention, using
  //    only fields already present on salon_directory. No new RPC
  //    or query needed. ──
  function getHealthFlags(s) {
    return getHealthFlagsLib(s);
  }

  function salonsNeedingAttention() {
    return salonsNeedingAttentionLib(realSalons);
  }

  function autoSalonsNeedingAttention() {
    return autoSalonsNeedingAttentionLib(salons);
  }

  // Loaded once, lazily, only when Auto Analytics is opened -- mirrors
  // loadAnalytics() above exactly, just against auto_platform_jobs
  // (migration 028) instead of salon_subscription_payments.
  async function loadAutoAnalytics() {
    if (autoAnalyticsLoaded) return;
    setAutoAnalyticsLoading(true);
    var rows = await saFetch("GET", "auto_platform_jobs", "?status=eq.completed&order=completed_at.asc");
    if (rows) setAllAutoJobs(rows);
    setAutoAnalyticsLoaded(true);
    setAutoAnalyticsLoading(false);
  }

  function autoRevenueByMonth() {
    return autoRevenueByMonthLib(allAutoJobs);
  }

  function autoRevenueBySalon() {
    return autoRevenueBySalonLib(allAutoJobs);
  }

  // PLANS is built from the database-fetched plans array (loaded lazily
  // when Plans view is opened, but also needed for the payment modal).
  // Falls back to hardcoded values if plans haven't been fetched yet
  // so the payment modal always works even on first open.
  var PLANS_FALLBACK = {
    monthly:     { label: "Monthly",      price_kes: 1200,  days: 30  },
    quarterly:   { label: "Quarterly",    price_kes: 3300,  days: 90  },
    semi_annual: { label: "Semi-Annual",  price_kes: 6000,  days: 180 },
    annual:      { label: "Annual",       price_kes: 10800, days: 365 },
    lifetime:    { label: "Lifetime",     price_kes: 38000, days: null },
  };
  var PLANS = plans.length > 0
    ? plans.reduce(function(acc, p) { acc[p.key] = p; return acc; }, {})
    : PLANS_FALLBACK;

  async function recordPayment(salon, plan, amount, notes) {
    setPaymentSaving(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setPaymentSaving(false); alert("Session expired. Please sign out and sign in again."); return; }
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

      // Step 3: Generate and immediately consume an invite under the hood.
      // complete_salon_onboarding now requires a valid invite token for
      // every caller, including admin-initiated signups — this keeps a
      // single enforced path instead of a separate admin bypass.
      var manualInviteRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_invite", {
        method: "POST",
        headers: {
          apikey:          SUPABASE_KEY,
          Authorization:   "Bearer " + token,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          p_email:      manualEmail.trim(),
          p_salon_name: manualName.trim(),
          p_module_key: manualModuleKey,
        }),
      });

      if (!manualInviteRes.ok) {
        setManualLoading(false);
        return alert("Could not prepare onboarding. Please try again.");
      }

      var manualInviteToken = await manualInviteRes.json();

      // Step 4: Call complete_salon_onboarding
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
          p_token:      manualInviteToken,
        }),
      });

      if (!rpcRes.ok) {
        var rpcErr = await rpcRes.json().catch(function() { return {}; });
        setManualLoading(false);
        return alert((manualModuleKey === "auto" ? "Car wash" : "Salon") + " setup failed: " + (rpcErr.message || JSON.stringify(rpcErr)));
      }

      setManualLoading(false);
      // Was hardcoded to /pos regardless of module -- a car wash onboarded
      // here has no /pos route, only /auto (see AutoApp.jsx's ModuleGate).
      setManualDone("✅ " + manualName + " onboarded successfully! " +
        (manualModuleKey === "auto" ? "Auto: /" + slug + "/auto" : "POS: /" + slug + "/pos"));
      logAction(manualModuleKey === "auto" ? "manual_onboard_auto" : "manual_onboard", null, manualName.trim(), "Slug: " + slug + " · Email: " + manualEmail.trim());
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
    if (!token) { setInviteLoading(false); alert("Session expired. Please sign out and sign in again."); return; }
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
        p_module_key: inviteModuleKey,
      }),
    });
    setInviteLoading(false);
    if (res.ok) {
      var inviteToken = await res.json();
      var link = window.location.origin + "/onboard?token=" + inviteToken;
      setInviteLink(link);
      logAction(inviteModuleKey === "auto" ? "generate_invite_auto" : "generate_invite", null, inviteName || null, inviteEmail ? "Pre-filled for: " + inviteEmail : null);
    } else {
      alert("Failed to generate invite link.");
    }
  }

  async function openSalonDetail(salon, returnView) {
    setSelectedSalon(salon);
    setDetailReturnView(returnView || "salons");
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
    if (!token) { setActionLoading(false); alert("Session expired. Please sign out and sign in again."); return; }
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

  async function toggleAutoModule(salon, enabled) {
    setActionLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setActionLoading(false); alert("Session expired. Please sign out and sign in again."); return; }
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/superadmin_set_module", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_salon_id:   salon.id,
        p_module_key: "auto",
        p_enabled:    enabled,
      }),
    });
    setActionLoading(false);
    if (res.ok) {
      logAction(enabled ? "enable_auto_module" : "disable_auto_module", salon.id, salon.name, null);
      await loadData();
    } else {
      var err = await res.json().catch(function() { return {}; });
      alert("Failed to update Auto module: " + (err.message || res.status));
    }
  }

  async function reactivateSalon(salon) {
    setActionLoading(true);
    var token = (await import("../lib/superAdminAuth")).getSuperAdminToken();
    if (!token) { setActionLoading(false); alert("Session expired. Please sign out and sign in again."); return; }
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
    if (!token) { setEditSaving(false); setEditError("Session expired. Please sign out and sign in again."); return; }

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
    if (!token) {
      setActionLoading(false);
      setResetPinError("Your session has expired. Please sign out and log back in to Super Admin.");
      return;
    }
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
  // Car washes (business_type='auto') are a genuinely separate business
  // from salons -- per explicit instruction, they must never appear on
  // the Salons side at all, only under the Auto product tab.
  var filteredSalons = salons.filter(function(s) {
    if (s.business_type === "auto") return false;
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
  // ── PLANS VIEW ───────────────────────────────────────────────────
  if (view === "plans") {
    return <PlansView
      plansLoading={plansLoading} plans={plans} planEditing={planEditing}
      planEditValue={planEditValue} planError={planError} planSaving={planSaving}
      setView={setView} setPlanEditing={setPlanEditing} setPlanEditValue={setPlanEditValue}
      setPlanError={setPlanError} updatePlanPrice={updatePlanPrice}
    />;
  }

  // ── AUDIT LOG VIEW ───────────────────────────────────────────────
  if (view === "audit") {
    return <AuditView auditLoading={auditLoading} auditLog={auditLog} salons={salons} setView={setView} />;
  }

  // ── ONBOARDING REQUESTS VIEW ────────────────────────────────────────
  // Requests submitted by sales reps from the field. Approving reuses
  // the existing create_invite RPC -- see approveRequest() above. Salon
  // creation itself is untouched by this; a request only ever produces
  // an invite link, exactly like the "+ Invite" button already does.
  if (view === "requests") {
    return <RequestsView
      setView={setView} requestsLoading={requestsLoading} onboardingRequests={onboardingRequests}
      rejectModal={rejectModal} setRejectModal={setRejectModal} rejectReason={rejectReason} setRejectReason={setRejectReason} rejectRequest={rejectRequest}
      approvingId={approvingId} approveRequest={approveRequest}
      addRepModal={addRepModal} setAddRepModal={setAddRepModal} addRepEmail={addRepEmail} setAddRepEmail={setAddRepEmail}
      addRepPass={addRepPass} setAddRepPass={setAddRepPass} addRepError={addRepError} setAddRepError={setAddRepError}
      addRepDone={addRepDone} addRepLoading={addRepLoading} addSalesRep={addSalesRep}
    />;
  }

  // ── HEALTH VIEW ───────────────────────────────────────────────────
  if (view === "health") {
    return <HealthView salonsNeedingAttention={salonsNeedingAttention} openSalonDetail={openSalonDetail} setView={setView} />;
  }

  // ── CAR WASHES VIEW (Trimora Auto module) ───────────────────────────
  // Salon = tenant; a "car wash" is just a salon with the Auto module
  // enabled via salon_enabled_modules (module_key='auto'). There's no
  // separate car-wash entity to create -- onboarding a new car wash
  // means either enabling Auto for an existing salon, or creating a new
  // salon (via +Manual / +Invite, unchanged) and then enabling Auto here.
  // Toggling calls superadmin_set_module, a new SECURITY DEFINER RPC --
  // salon_enabled_modules never had a superadmin write path before this
  // (its own migration comment says toggling was meant to be a
  // service-role-only action), so this is genuinely new capability, not
  // a UI wired onto something that already worked another way.
  if (view === "carwashes") {
    return <CarWashesView
      salons={salons} view={view} setView={setView} PRODUCTS={PRODUCTS} Badge={Badge}
      loadAutoAnalytics={loadAutoAnalytics} loadAuditLog={loadAuditLog} loadAutoOnboardingRequests={loadAutoOnboardingRequests} setCombinedPLBackTo={setCombinedPLBackTo}
      setManualModuleKey={setManualModuleKey} setManualModal={setManualModal} setManualDone={setManualDone}
      setInviteModuleKey={setInviteModuleKey} setInviteModal={setInviteModal} setInviteLink={setInviteLink} setInviteEmail={setInviteEmail} setInviteName={setInviteName}
      openSalonDetail={openSalonDetail} actionLoading={actionLoading} toggleAutoModule={toggleAutoModule}
      addExistingSalonId={addExistingSalonId} setAddExistingSalonId={setAddExistingSalonId}
    />;
  }

  // ── AUTO HEALTH VIEW ─────────────────────────────────────────────
  // Mirrors the salon Health view exactly, using getAutoHealthFlags
  // (salonHealth.js) against salon_directory's auto_* columns
  // (migration 028) -- no new fetch, same loaded `salons` state.
  if (view === "autohealth") {
    return <AutoHealthView autoSalonsNeedingAttention={autoSalonsNeedingAttention} openSalonDetail={openSalonDetail} setView={setView} />;
  }

  // ── AUTO ANALYTICS VIEW ──────────────────────────────────────────
  if (view === "autoanalytics") {
    return <AutoAnalyticsView
      setView={setView} autoAnalyticsLoading={autoAnalyticsLoading} allAutoJobs={allAutoJobs}
      autoRevenueByMonth={autoRevenueByMonth} autoRevenueBySalon={autoRevenueBySalon} fmt={fmt} StatCard={StatCard}
    />;
  }

  // ── COMBINED P&L VIEW ────────────────────────────────────────────
  // Reachable from both the Salons and Car Washes nav rows (see the
  // two nav-button arrays below) since it's genuinely platform-wide,
  // not owned by either product. backTo remembers which one to return
  // to, set at the point each button calls setView("combinedpl").
  if (view === "combinedpl") {
    return <CombinedPLView setView={setView} stats={stats} fmt={fmt} backTo={combinedPLBackTo} />;
  }

  // ── AUTO AUDIT LOG VIEW ──────────────────────────────────────────
  // Reuses the same loaded auditLog state as the main Audit Log view
  // (loadAuditLog() is called from the nav button below, same as the
  // Salons product's Audit Log entry point) -- just filtered to Auto-
  // tagged actions. No new RPC, no separate log.
  if (view === "autoaudit") {
    return <AutoAuditView auditLoading={auditLoading} auditLog={auditLog} setView={setView} />;
  }

  // ── AUTO REQUESTS VIEW ───────────────────────────────────────────
  // Mirrors the salon Onboarding Requests view exactly, against
  // auto_onboarding_requests (a genuinely separate table, not a flag on
  // salon_onboarding_requests) and approveAutoRequest()/rejectAutoRequest()
  // above. Approving passes p_module_key: "auto" to create_invite -- the
  // exact same RPC the salon flow uses, just tagged -- so the resulting
  // salon has Auto enabled automatically the moment onboarding completes.
  if (view === "autorequests") {
    return <AutoRequestsView
      setView={setView} autoRequestsLoading={autoRequestsLoading} autoOnboardingRequests={autoOnboardingRequests}
      autoApprovingId={autoApprovingId} approveAutoRequest={approveAutoRequest}
      autoRejectModal={autoRejectModal} setAutoRejectModal={setAutoRejectModal} autoRejectReason={autoRejectReason} setAutoRejectReason={setAutoRejectReason} rejectAutoRequest={rejectAutoRequest}
      setAddRepModal={setAddRepModal} setAddRepEmail={setAddRepEmail} setAddRepPass={setAddRepPass} setAddRepError={setAddRepError}
    />;
  }

  // ── ANALYTICS VIEW ───────────────────────────────────────────────
  if (view === "analytics") {
    return <AnalyticsView
      setView={setView} analyticsLoading={analyticsLoading}
      revenueByMonth={revenueByMonth} salonsByMonth={salonsByMonth} revenueBySalon={revenueBySalon} fmt={fmt}
    />;
  }

  if (view === "detail" && selectedSalon) {
    return <DetailView
      selectedSalon={selectedSalon} setView={setView} detailReturnView={detailReturnView} setSelectedSalon={setSelectedSalon}
      Badge={Badge} StatCard={StatCard} fmt={fmt} PLANS={PLANS}
      setPaymentModal={setPaymentModal} setPayAmount={setPayAmount}
      historyLoading={historyLoading} paymentHistory={paymentHistory}
      openEditModal={openEditModal}
      setResetPinModal={setResetPinModal} setResetPinRole={setResetPinRole} setResetPinValue={setResetPinValue} setResetPinConfirm={setResetPinConfirm} setResetPinError={setResetPinError}
      reactivateSalon={reactivateSalon} actionLoading={actionLoading} setSuspendModal={setSuspendModal}
      paymentModal={paymentModal} payPlan={payPlan} setPayPlan={setPayPlan} payAmount={payAmount} payNotes={payNotes} setPayNotes={setPayNotes} paymentSaving={paymentSaving} recordPayment={recordPayment}
      suspendModal={suspendModal} suspendReason={suspendReason} setSuspendReason={setSuspendReason} suspendSalon={suspendSalon}
    />;
  }

  // ── MAIN LIST VIEW ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>

      {/* Header */}
      <div style={{ background: BLACK, padding: "14px 20px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: GOLD, letterSpacing: "0.1em" }}>TRIMORA</div>
            <div style={{ fontSize: 10, color: GOLD_DIM, letterSpacing: "0.15em" }}>SUPER ADMIN</div>
          </div>
          {session && <div style={{ fontSize: 10, color: GOLD_DIM + "88" }}>{session.email}</div>}
        </div>

        {/* Product switcher -- data-driven off PRODUCTS above, so a
            future product needs no changes here, just a new PRODUCTS
            entry and its own view block. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
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

        {/* Horizontally scrollable button row on phones; spreads evenly
            across the width on tablets/laptops via the media query below
            (>=900px). Base behavior (scroll, no wrap) is unchanged for
            narrow screens -- this only adds a wider-screen layout. */}
        <style>{`
          @media (min-width: 900px) {
            .sa-nav-row { justify-content: space-between; overflow-x: visible; }
          }
        `}</style>
        <div className="sa-nav-row" style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none", paddingBottom: 2 }}>
          {[
            { label: "💲 Plans",      onClick: function() { setView("plans"); loadPlans(); } },
            { label: "📋 Audit Log",  onClick: function() { setView("audit"); loadAuditLog(); } },
            { label: "🧑‍💼 Requests", onClick: function() { setView("requests"); loadOnboardingRequests(); } },
            { label: "🩺 Health",     onClick: function() { setView("health"); } },
            { label: "📊 Analytics",  onClick: function() { setView("analytics"); loadAnalytics(); } },
            { label: "💰 P&L",        onClick: function() { setCombinedPLBackTo("salons"); setView("combinedpl"); } },
            { label: "+ Manual",      onClick: function() { setManualModuleKey(null); setManualModal(true); setManualDone(""); } },
            { label: "+ Invite",      onClick: function() { setInviteModuleKey(null); setInviteModal(true); setInviteLink(""); setInviteEmail(""); setInviteName(""); }, highlight: true },
            { label: "Sign Out",      onClick: handleLogout, muted: true },
          ].map(function(btn) {
            return (
              <button
                key={btn.label}
                onClick={btn.onClick}
                style={{
                  flexShrink: 0,
                  background: btn.highlight ? GOLD_DIM : btn.muted ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
                  border: btn.highlight ? "none" : "1px solid " + GOLD_DIM + "44",
                  color: btn.highlight ? BLACK : btn.muted ? GOLD_DIM : WHITE,
                  borderRadius: 20,
                  padding: "7px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: btn.muted ? 700 : 800,
                  whiteSpace: "nowrap",
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Session expired banner — shows inline rather than letting
          cryptic JWT errors surface from individual action calls */}
      {sessionExpired && (
        <div style={{ background: "#FEF3C7", borderBottom: "1.5px solid #F59E0B", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
            ⚠️ Your session has expired. Sign out and sign in again to make changes.
          </div>
          <button
            onClick={handleLogout}
            style={{ background: "#92400E", color: WHITE, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      )}


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
              onClick={function() { openSalonDetail(s, "salons"); }}
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
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>{manualModuleKey === "auto" ? "🚗 Onboard Car Wash" : "🏪 Manual Onboarding"}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{manualModuleKey === "auto" ? "Create a car wash with Auto enabled from the start, without an invite link." : "Create a salon directly without an invite link."}</div>

            {(manualModuleKey === "auto" ? [
              ["Car Wash Name", manualName, setManualName, "text", "e.g. High Point Carwash"],
              ["Owner Email", manualEmail, setManualEmail, "email", "owner@example.com"],
              ["Temporary Password", manualPass, setManualPass, "password", "Min 6 characters"],
            ] : [
              ["Salon Name", manualName, setManualName, "text", "e.g. Grace Beauty Studio"],
              ["Owner Email", manualEmail, setManualEmail, "email", "owner@salon.com"],
              ["Temporary Password", manualPass, setManualPass, "password", "Min 6 characters"],
            ]).map(function(field) {
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
                {manualModuleKey === "auto"
                  ? (manualLoading ? "Creating car wash..." : "🚗 Create Car Wash")
                  : (manualLoading ? "Creating salon..." : "🏪 Create Salon")}
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
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>{inviteModuleKey === "auto" ? "🚗 Invite Car Wash" : "🔗 Generate Invite Link"}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{inviteModuleKey === "auto" ? "One-time link, Auto enabled automatically on completion. Expires in 7 days." : "One-time link, expires in 7 days."}</div>

            <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Prospect's Email (optional — pre-fills the form)</label>
            <input
              value={inviteEmail}
              onChange={function(e) { setInviteEmail(e.target.value); setInviteLink(""); }}
              placeholder={inviteModuleKey === "auto" ? "owner@example.com" : "salon@example.com"}
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: CREAM, padding: "11px 13px", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: DARK, marginBottom: 12 }}
            />

            <label style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, display: "block", marginBottom: 6, textTransform: "uppercase" }}>{inviteModuleKey === "auto" ? "Car Wash Name" : "Salon Name"} (optional — pre-fills the form)</label>
            <input
              value={inviteName}
              onChange={function(e) { setInviteName(e.target.value); setInviteLink(""); }}
              placeholder={inviteModuleKey === "auto" ? "e.g. High Point Carwash" : "e.g. Grace Beauty Studio"}
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

      {/* Suspend modal */}
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
