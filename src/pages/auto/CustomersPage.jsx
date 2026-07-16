// src/pages/auto/CustomersPage.jsx
//
// Feature audit gap: "Customer history 🟡 -- data exists (jobs linked
// via customer_id), no dedicated per-customer history view." This adds
// that view, admin-only (new tab in AutoApp.jsx alongside
// Staff/Services/Reports/Expenses).
//
// Scoped to customers who have actually brought a vehicle to THIS
// business -- built from auto_vehicles (already salon-scoped by
// db.js's TENANT_TABLES mechanism), not from the full shared customers
// table directly, since customers is shared with POS and a mixed
// salon+car-wash business (Kimms) would otherwise mix in
// haircut-only customers who've never used Auto at all.
//
// visit_count/total_spend/Loyalty tier shown here are the same shared,
// combined-across-both-products figures LoyaltyBadge already shows
// everywhere else in this codebase (Check-In, Board) -- deliberately
// NOT recomputed as an Auto-only figure, to stay consistent with the
// established shared-loyalty convention rather than introduce a second,
// differently-scoped number for the same customer.
//
// The job history list within a customer's detail view mirrors
// ReportsPage.jsx's own per-job card layout (added this session) for
// visual consistency, but is unfiltered by date range -- this is a
// full history, not a reporting-period view.

import { useState, useEffect, useCallback } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import LoyaltyBadge from "../../components/LoyaltyBadge";
import VehiclePhotoUpload from "../../components/VehiclePhotoUpload";
import AutoBirthdayReminders from "../../components/AutoBirthdayReminders";
import { INK, STEEL, CHROME, SIGNAL, PAPER, ALERT } from "./theme";

function money(n) {
  return "KSh " + Math.round(n || 0).toLocaleString();
}

export default function CustomersPage() {
  var salon = useSalon();
  var vehiclesState = useState([]); var vehicles = vehiclesState[0]; var setVehicles = vehiclesState[1];
  var jobsState = useState([]); var jobs = jobsState[0]; var setJobs = jobsState[1];
  var jobServicesState = useState([]); var jobServices = jobServicesState[0]; var setJobServices = jobServicesState[1];
  var staffState = useState([]); var staff = staffState[0]; var setStaff = staffState[1];
  var birthdayCampaignState = useState(null); var birthdayCampaign = birthdayCampaignState[0]; var setBirthdayCampaign = birthdayCampaignState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var searchState = useState(""); var search = searchState[0]; var setSearch = searchState[1];
  var fleetOnlyState = useState(false); var fleetOnly = fleetOnlyState[0]; var setFleetOnly = fleetOnlyState[1];
  var fleetNameEditsState = useState({}); var fleetNameEdits = fleetNameEditsState[0]; var setFleetNameEdits = fleetNameEditsState[1];
  var selectedIdState = useState(null); var selectedId = selectedIdState[0]; var setSelectedId = selectedIdState[1];
  var selectedVehicleIdState = useState(null); var selectedVehicleId = selectedVehicleIdState[0]; var setSelectedVehicleId = selectedVehicleIdState[1];

  // Membership plans (Customer Mgmt, phase 1: DB layer was added earlier
  // this session -- this wires the admin UI on top of it). Plans are
  // salon-defined and managed inline from this page rather than a new
  // Settings section, since "who can buy what" and "here's who bought
  // what" are the same screen's concern.
  var plansState = useState([]); var plans = plansState[0]; var setPlans = plansState[1];
  var membershipsState = useState([]); var memberships = membershipsState[0]; var setMemberships = membershipsState[1];
  var autoServicesState = useState([]); var autoServices = autoServicesState[0]; var setAutoServices = autoServicesState[1];
  var showPlanEditorState = useState(false); var showPlanEditor = showPlanEditorState[0]; var setShowPlanEditor = showPlanEditorState[1];
  var planFormState = useState({ name: "", covered_service_id: "", term_days: "90", price: "" });
  var planForm = planFormState[0]; var setPlanForm = planFormState[1];
  var showSellModalState = useState(false); var showSellModal = showSellModalState[0]; var setShowSellModal = showSellModalState[1];
  var sellFormState = useState({ plan_id: "", amount_paid: "", sold_by_staff_id: "" });
  var sellForm = sellFormState[0]; var setSellForm = sellFormState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];

  // Wallet: topup/credit both go through the same apply_wallet_transaction
  // RPC (server-side atomic balance update + ledger row), just with a
  // different `type` and, for topup, a payment_method describing how the
  // cash/M-Pesa was actually collected. Spend (at checkout) lives in
  // BoardPage.jsx instead, since that's where the payable amount is known.
  var walletTransactionsState = useState([]); var walletTransactions = walletTransactionsState[0]; var setWalletTransactions = walletTransactionsState[1];
  var showTopUpModalState = useState(false); var showTopUpModal = showTopUpModalState[0]; var setShowTopUpModal = showTopUpModalState[1];
  var showCreditModalState = useState(false); var showCreditModal = showCreditModalState[0]; var setShowCreditModal = showCreditModalState[1];
  var topUpFormState = useState({ amount: "", payment_method: "Cash", sold_by_staff_id: "" });
  var topUpForm = topUpFormState[0]; var setTopUpForm = topUpFormState[1];
  var creditFormState = useState({ amount: "", notes: "", sold_by_staff_id: "" });
  var creditForm = creditFormState[0]; var setCreditForm = creditFormState[1];
  var walletErrorState = useState(""); var walletError = walletErrorState[0]; var setWalletError = walletErrorState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_vehicles", null, "?select=*,customers(*)&order=created_at.desc"),
      db("GET", "auto_jobs", null, "?status=eq.completed&order=completed_at.desc&select=*,auto_vehicles(reg_number,make)"),
      db("GET", "auto_job_services", null, "?select=*,auto_services(name)"),
      db("GET", "staff", null, "?order=name.asc"),
      db("GET", "marketing_campaigns", null, "?type=eq.birthday&is_active=eq.true&limit=1"),
      db("GET", "auto_membership_plans", null, "?order=created_at.desc"),
      db("GET", "customer_memberships", null, "?order=created_at.desc&select=*,auto_membership_plans(name,covered_service_id,term_days)"),
      db("GET", "auto_services", null, "?order=name.asc"),
      db("GET", "customer_wallet_transactions", null, "?order=created_at.desc&limit=200"),
    ]);
    setVehicles(results[0] || []);
    setJobs(results[1] || []);
    setJobServices(results[2] || []);
    setStaff(results[3] || []);
    if (Array.isArray(results[4]) && results[4][0]) setBirthdayCampaign(results[4][0]);
    setPlans(results[5] || []);
    setMemberships(results[6] || []);
    setAutoServices(results[7] || []);
    setWalletTransactions(results[8] || []);
    setLoading(false);
  }, []);

  useEffect(function () { load(); }, [load]);

  // Group vehicles by customer -- a customer with no customer_id
  // (shouldn't happen given the FK, but defensive) is skipped rather
  // than crashing the grouping.
  var customersById = {};
  vehicles.forEach(function (v) {
    var c = v.customers;
    if (!c) return;
    if (!customersById[c.id]) customersById[c.id] = { customer: c, vehicles: [] };
    customersById[c.id].vehicles.push(v);
  });
  var customerRows = Object.values(customersById).sort(function (a, b) {
    return (b.customer.total_spend || 0) - (a.customer.total_spend || 0);
  });

  var q = search.trim().toLowerCase();
  var filteredRows = (q === "" ? customerRows : customerRows.filter(function (row) {
    var c = row.customer;
    var nameMatch = (c.name || "").toLowerCase().indexOf(q) !== -1;
    var phoneMatch = (c.phone || "").toLowerCase().indexOf(q) !== -1;
    var plateMatch = row.vehicles.some(function (v) { return (v.reg_number || "").toLowerCase().indexOf(q) !== -1; });
    return nameMatch || phoneMatch || plateMatch;
  })).filter(function (row) {
    return !fleetOnly || row.vehicles.some(function (v) { return v.is_fleet; });
  });

  var staffById = {};
  staff.forEach(function (s) { staffById[s.id] = s; });

  var selected = selectedId ? customersById[selectedId] : null;
  var theirJobs = selected ? jobs.filter(function (j) { return j.customer_id === selectedId; }) : [];
  var theirMemberships = selected ? memberships.filter(function (m) { return m.customer_id === selectedId; }) : [];
  var theirWalletTransactions = selected ? walletTransactions.filter(function (t) { return t.customer_id === selectedId; }) : [];
  var activePlans = plans.filter(function (p) { return p.active; });
  var servicesById = {};
  autoServices.forEach(function (s) { servicesById[s.id] = s; });
  var plansById = {};
  plans.forEach(function (p) { plansById[p.id] = p; });

  async function topUpWallet() {
    if (saving || !selected) return;
    var amount = parseInt(topUpForm.amount, 10);
    if (isNaN(amount) || amount <= 0) { setWalletError("Enter an amount greater than 0."); return; }
    setSaving(true);
    setWalletError("");
    var result = await dbRpcAuth("apply_wallet_transaction", {
      p_customer_id: selected.customer.id, p_type: "topup", p_amount: amount,
      p_payment_method: topUpForm.payment_method, p_created_by: topUpForm.sold_by_staff_id || null,
    });
    setSaving(false);
    if (result.error) { setWalletError(result.error); return; }
    setTopUpForm({ amount: "", payment_method: "Cash", sold_by_staff_id: "" });
    setShowTopUpModal(false);
    load();
  }

  async function addWalletCredit() {
    if (saving || !selected) return;
    var amount = parseInt(creditForm.amount, 10);
    if (isNaN(amount) || amount <= 0) { setWalletError("Enter an amount greater than 0."); return; }
    setSaving(true);
    setWalletError("");
    var result = await dbRpcAuth("apply_wallet_transaction", {
      p_customer_id: selected.customer.id, p_type: "credit", p_amount: amount,
      p_notes: creditForm.notes || null, p_created_by: creditForm.sold_by_staff_id || null,
    });
    setSaving(false);
    if (result.error) { setWalletError(result.error); return; }
    setCreditForm({ amount: "", notes: "", sold_by_staff_id: "" });
    setShowCreditModal(false);
    load();
  }

  function membershipStatusLabel(m) {
    if (m.status !== "active") return m.status;
    return new Date(m.expires_at) < new Date() ? "expired" : "active";
  }

  async function savePlan() {
    if (saving) return;
    var name = planForm.name.trim();
    var termDays = parseInt(planForm.term_days, 10);
    var price = parseInt(planForm.price, 10);
    if (!name || !planForm.covered_service_id || !termDays || termDays <= 0 || isNaN(price) || price < 0) return;
    setSaving(true);
    await db("POST", "auto_membership_plans", {
      salon_id: salon.id, name: name, covered_service_id: planForm.covered_service_id,
      term_days: termDays, price: price, active: true,
    });
    setPlanForm({ name: "", covered_service_id: "", term_days: "90", price: "" });
    setShowPlanEditor(false);
    setSaving(false);
    load();
  }

  async function togglePlanActive(plan) {
    if (saving) return;
    setSaving(true);
    await db("PATCH", "auto_membership_plans", { active: !plan.active }, "?id=eq." + plan.id);
    setSaving(false);
    load();
  }

  async function toggleVehicleFleet(v) {
    await db("PATCH", "auto_vehicles", { is_fleet: !v.is_fleet, fleet_name: !v.is_fleet ? (v.fleet_name || null) : null }, "?id=eq." + v.id);
    load();
  }

  async function saveFleetName(v) {
    var name = fleetNameEdits[v.id];
    if (name === undefined || name === (v.fleet_name || "")) return;
    await db("PATCH", "auto_vehicles", { fleet_name: name.trim() || null }, "?id=eq." + v.id);
    load();
  }

  async function sellMembership() {
    if (saving || !selected) return;
    var plan = plansById[sellForm.plan_id];
    if (!plan) return;
    var amountPaid = sellForm.amount_paid === "" ? plan.price : parseInt(sellForm.amount_paid, 10);
    if (isNaN(amountPaid) || amountPaid < 0) return;
    setSaving(true);
    var startedAt = new Date();
    var expiresAt = new Date(startedAt.getTime() + plan.term_days * 24 * 60 * 60 * 1000);
    await db("POST", "customer_memberships", {
      salon_id: salon.id, customer_id: selected.customer.id, plan_id: plan.id,
      started_at: startedAt.toISOString(), expires_at: expiresAt.toISOString(),
      amount_paid: amountPaid, status: "active",
      sold_by_staff_id: sellForm.sold_by_staff_id || null,
    });
    setSellForm({ plan_id: "", amount_paid: "", sold_by_staff_id: "" });
    setShowSellModal(false);
    setSaving(false);
    load();
  }

  var panelStyle = {
    background: STEEL, borderRadius: 14, padding: 20, marginBottom: 16,
    border: "1px solid rgba(143,166,184,0.15)",
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", background: INK }} />;
  }

  // Detail view
  if (selected) {
    return (
      <div style={{ minHeight: "100vh", background: INK, fontFamily: "system-ui, -apple-system, sans-serif", paddingBottom: 40 }}>
        <div style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
          <div onClick={function () { setSelectedId(null); setSelectedVehicleId(null); }} style={{ fontSize: 13, color: SIGNAL, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
            ← All customers
          </div>

          <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: PAPER }}>{selected.customer.name}</div>
                <div style={{ fontSize: 13, color: CHROME }}>{selected.customer.phone}</div>
              </div>
              <LoyaltyBadge customer={selected.customer} size="md" />
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: CHROME, textTransform: "uppercase" }}>Visits</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: PAPER }}>{selected.customer.visit_count || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: CHROME, textTransform: "uppercase" }}>Total spend</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: PAPER }}>{money(selected.customer.total_spend)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: CHROME, textTransform: "uppercase" }}>Last visit</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: PAPER }}>{selected.customer.last_visit || "—"}</div>
              </div>
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME }}>
                Membership
              </div>
              <div onClick={function () { setShowSellModal(true); }} style={{ fontSize: 12, color: SIGNAL, fontWeight: 700, cursor: "pointer" }}>
                + Sell membership
              </div>
            </div>
            {theirMemberships.length === 0 && (
              <div style={{ fontSize: 13, color: CHROME }}>No membership on record.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {theirMemberships.map(function (m) {
                var plan = m.auto_membership_plans || {};
                var status = membershipStatusLabel(m);
                var statusColor = status === "active" ? SIGNAL : CHROME;
                return (
                  <div key={m.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid " + CHROME + "22", background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>{plan.name || "Membership"}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: statusColor, textTransform: "uppercase" }}>{status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: CHROME, marginTop: 4 }}>
                      {new Date(m.started_at).toLocaleDateString("en-KE")} – {new Date(m.expires_at).toLocaleDateString("en-KE")} · {money(m.amount_paid)} paid
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {showSellModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
              <div style={Object.assign({}, panelStyle, { width: "100%", maxWidth: 420, marginBottom: 0 })}>
                <div style={{ fontSize: 15, fontWeight: 800, color: PAPER, marginBottom: 12 }}>Sell membership to {selected.customer.name}</div>
                {activePlans.length === 0 ? (
                  <div style={{ fontSize: 13, color: CHROME, marginBottom: 12 }}>
                    No membership plans have been created yet. Close this and use "Manage Plans" from the customer list to create one.
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Plan</div>
                      <select value={sellForm.plan_id}
                        onChange={function (e) {
                          var plan = plansById[e.target.value];
                          setSellForm(Object.assign({}, sellForm, { plan_id: e.target.value, amount_paid: plan ? String(plan.price) : "" }));
                        }}
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px 10px", fontSize: 13 }}>
                        <option value="">Choose a plan…</option>
                        {activePlans.map(function (p) {
                          var svc = servicesById[p.covered_service_id];
                          return <option key={p.id} value={p.id}>{p.name} — {p.term_days}d — {money(p.price)}{svc ? " (" + svc.name + ")" : ""}</option>;
                        })}
                      </select>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Amount paid (KSh)</div>
                      <input type="number" value={sellForm.amount_paid}
                        onChange={function (e) { setSellForm(Object.assign({}, sellForm, { amount_paid: e.target.value })); }}
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px 10px", fontSize: 13 }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Sold by (optional)</div>
                      <select value={sellForm.sold_by_staff_id}
                        onChange={function (e) { setSellForm(Object.assign({}, sellForm, { sold_by_staff_id: e.target.value })); }}
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px 10px", fontSize: 13 }}>
                        <option value="">Unattributed</option>
                        {staff.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                      </select>
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={function () { setShowSellModal(false); setSellForm({ plan_id: "", amount_paid: "", sold_by_staff_id: "" }); }}
                    style={{ flex: 1, background: "transparent", color: CHROME, border: "1.5px solid " + CHROME + "55", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Cancel
                  </button>
                  {activePlans.length > 0 && (
                    <button onClick={sellMembership} disabled={saving || !sellForm.plan_id}
                      style={{ flex: 1, background: SIGNAL, color: INK, border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: (saving || !sellForm.plan_id) ? 0.6 : 1 }}>
                      Confirm sale
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME }}>
                Wallet
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <span onClick={function () { setWalletError(""); setShowTopUpModal(true); }} style={{ fontSize: 12, color: SIGNAL, fontWeight: 700, cursor: "pointer" }}>
                  + Top up
                </span>
                <span onClick={function () { setWalletError(""); setShowCreditModal(true); }} style={{ fontSize: 12, color: CHROME, fontWeight: 700, cursor: "pointer" }}>
                  + Add credit
                </span>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: PAPER, marginBottom: 10 }}>
              {money(selected.customer.wallet_balance || 0)}
            </div>
            {theirWalletTransactions.length === 0 ? (
              <div style={{ fontSize: 13, color: CHROME }}>No wallet activity yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {theirWalletTransactions.slice(0, 10).map(function (t) {
                  var isCredit = t.change_amount > 0;
                  var label = t.type === "topup" ? "Top up" + (t.payment_method ? " (" + t.payment_method + ")" : "")
                    : t.type === "credit" ? "Credit" + (t.notes ? " — " + t.notes : "")
                    : "Spent at checkout";
                  return (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid " + CHROME + "15" }}>
                      <div>
                        <div style={{ fontSize: 12, color: PAPER }}>{label}</div>
                        <div style={{ fontSize: 10, color: CHROME }}>{new Date(t.created_at).toLocaleString("en-KE")}</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isCredit ? SIGNAL : CHROME }}>
                        {isCredit ? "+" : "−"}{money(Math.abs(t.change_amount))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(showTopUpModal || showCreditModal) && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
              <div style={Object.assign({}, panelStyle, { width: "100%", maxWidth: 420, marginBottom: 0 })}>
                <div style={{ fontSize: 15, fontWeight: 800, color: PAPER, marginBottom: 12 }}>
                  {showTopUpModal ? "Top up wallet — " + selected.customer.name : "Add credit — " + selected.customer.name}
                </div>
                {walletError && (
                  <div style={{ fontSize: 12, color: ALERT, marginBottom: 10 }}>{walletError}</div>
                )}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Amount (KSh)</div>
                  {showTopUpModal ? (
                    <input type="number" value={topUpForm.amount}
                      onChange={function (e) { setTopUpForm(Object.assign({}, topUpForm, { amount: e.target.value })); }}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
                  ) : (
                    <input type="number" value={creditForm.amount}
                      onChange={function (e) { setCreditForm(Object.assign({}, creditForm, { amount: e.target.value })); }}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
                  )}
                </div>
                {showTopUpModal && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Collected via</div>
                    <select value={topUpForm.payment_method}
                      onChange={function (e) { setTopUpForm(Object.assign({}, topUpForm, { payment_method: e.target.value })); }}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }}>
                      {((salon && salon.enabled_payment_methods) || ["Cash", "Till"]).map(function (m) { return <option key={m} value={m}>{m}</option>; })}
                    </select>
                  </div>
                )}
                {showCreditModal && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Reason (optional, e.g. "Refund for job #123")</div>
                    <input value={creditForm.notes}
                      onChange={function (e) { setCreditForm(Object.assign({}, creditForm, { notes: e.target.value })); }}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Processed by (optional)</div>
                  <select value={showTopUpModal ? topUpForm.sold_by_staff_id : creditForm.sold_by_staff_id}
                    onChange={function (e) {
                      if (showTopUpModal) setTopUpForm(Object.assign({}, topUpForm, { sold_by_staff_id: e.target.value }));
                      else setCreditForm(Object.assign({}, creditForm, { sold_by_staff_id: e.target.value }));
                    }}
                    style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }}>
                    <option value="">Unattributed</option>
                    {staff.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={function () {
                    setShowTopUpModal(false); setShowCreditModal(false);
                    setTopUpForm({ amount: "", payment_method: "Cash", sold_by_staff_id: "" });
                    setCreditForm({ amount: "", notes: "", sold_by_staff_id: "" });
                    setWalletError("");
                  }} style={{ flex: 1, background: "transparent", color: CHROME, border: "1.5px solid " + CHROME + "55", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={showTopUpModal ? topUpWallet : addWalletCredit} disabled={saving}
                    style={{ flex: 1, background: SIGNAL, color: INK, border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={panelStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME, marginBottom: 10 }}>
              Vehicles ({selected.vehicles.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selected.vehicles.map(function (v) {
                var isExpanded = selectedVehicleId === v.id;
                return (
                  <div key={v.id} style={{ borderRadius: 10, border: "1px solid " + CHROME + "22", overflow: "hidden" }}>
                    <div onClick={function () { setSelectedVehicleId(isExpanded ? null : v.id); }}
                      style={{ padding: "10px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: PAPER, display: "flex", alignItems: "center", gap: 8 }}>
                        {[v.reg_number, v.make, v.model, v.color].filter(Boolean).join(" · ")}
                        {v.is_fleet && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: INK, background: SIGNAL, borderRadius: 4, padding: "2px 6px" }}>
                            FLEET{v.fleet_name ? " · " + v.fleet_name : ""}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: CHROME }}>{isExpanded ? "Hide photos ▲" : "Photos ▼"}</div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: "10px 12px", borderTop: "1px solid " + CHROME + "22" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: v.is_fleet ? 8 : 12, cursor: "pointer" }}>
                          <input type="checkbox" checked={!!v.is_fleet}
                            onChange={function () { toggleVehicleFleet(v); }}
                            style={{ width: 16, height: 16, cursor: "pointer" }} />
                          <span style={{ fontSize: 12, color: PAPER, fontWeight: 700 }}>Fleet vehicle</span>
                        </label>
                        {v.is_fleet && (
                          <input
                            value={fleetNameEdits[v.id] !== undefined ? fleetNameEdits[v.id] : (v.fleet_name || "")}
                            onChange={function (e) {
                              var val = e.target.value;
                              setFleetNameEdits(function (prev) { return Object.assign({}, prev, { [v.id]: val }); });
                            }}
                            onBlur={function () { saveFleetName(v); }}
                            placeholder="Fleet/company name (optional)"
                            style={{
                              width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER,
                              border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 12,
                            }} />
                        )}
                        <VehiclePhotoUpload vehicleId={v.id} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME, marginBottom: 10 }}>
              Job history ({theirJobs.length})
            </div>
            {theirJobs.length === 0 && (
              <div style={{ fontSize: 13, color: CHROME }}>No completed jobs yet.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {theirJobs.map(function (j) {
                var completed = j.completed_at ? new Date(j.completed_at) : null;
                var vehicle = j.auto_vehicles || {};
                var vehicleText = [vehicle.reg_number, vehicle.make].filter(Boolean).join(" · ") || "Vehicle";
                var staffMember = staffById[j.assigned_staff_id];
                var lines = jobServices.filter(function (js) { return js.job_id === j.id; });
                var servicesText = lines.map(function (js) { return (js.auto_services && js.auto_services.name) || "Service"; }).join(", ");
                var discountAmount = j.discount_amount || 0;
                var payable = (j.total_price || 0) - discountAmount;
                return (
                  <div key={j.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid " + CHROME + "22", background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>{vehicleText}</div>
                        <div style={{ fontSize: 11, color: CHROME }}>
                          {completed ? completed.toLocaleDateString("en-KE") + " " + completed.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: SIGNAL }}>{money(payable)}</div>
                        <div style={{ fontSize: 10, color: CHROME }}>{j.payment_method || "—"}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: CHROME, marginTop: 6 }}>
                      {servicesText || "No services"}{staffMember ? " · " + staffMember.name : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div style={{ minHeight: "100vh", background: INK, fontFamily: "system-ui, -apple-system, sans-serif", paddingBottom: 40 }}>
      <div style={{ padding: "20px 20px 4px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: PAPER }}>Customers</div>
      </div>
      <div style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
        <AutoBirthdayReminders
          customers={customerRows.map(function (row) { return row.customer; })}
          salonName={salon && salon.name}
          salon={salon}
          birthdayCampaign={birthdayCampaign}
        />

        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: plans.length > 0 || showPlanEditor ? 10 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME }}>
              Membership Plans
            </div>
            <div onClick={function () { setShowPlanEditor(!showPlanEditor); }} style={{ fontSize: 12, color: SIGNAL, fontWeight: 700, cursor: "pointer" }}>
              {showPlanEditor ? "Cancel" : "+ New Plan"}
            </div>
          </div>

          {showPlanEditor && (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: "1px solid " + CHROME + "22", background: "rgba(255,255,255,0.02)" }}>
              <input value={planForm.name} onChange={function (e) { setPlanForm(Object.assign({}, planForm, { name: e.target.value })); }}
                placeholder="Plan name (e.g. 3-Month Unlimited Basic Wash)"
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13, marginBottom: 8 }} />
              <select value={planForm.covered_service_id} onChange={function (e) { setPlanForm(Object.assign({}, planForm, { covered_service_id: e.target.value })); }}
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13, marginBottom: 8 }}>
                <option value="">Covered service…</option>
                {autoServices.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
              </select>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="number" value={planForm.term_days} onChange={function (e) { setPlanForm(Object.assign({}, planForm, { term_days: e.target.value })); }}
                  placeholder="Term (days)"
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
                <input type="number" value={planForm.price} onChange={function (e) { setPlanForm(Object.assign({}, planForm, { price: e.target.value })); }}
                  placeholder="Price (KSh)"
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
              </div>
              <button onClick={savePlan} disabled={saving} style={{
                width: "100%", background: SIGNAL, color: INK, border: "none", borderRadius: 8, padding: "10px",
                fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.6 : 1,
              }}>
                Create plan
              </button>
            </div>
          )}

          {plans.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {plans.map(function (p) {
                var svc = servicesById[p.covered_service_id];
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", opacity: p.active ? 1 : 0.5 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: PAPER }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: CHROME }}>{p.term_days}d · {money(p.price)}{svc ? " · " + svc.name : ""}</div>
                    </div>
                    <span onClick={function () { togglePlanActive(p); }} style={{ fontSize: 10, color: CHROME, textDecoration: "underline", cursor: "pointer" }}>
                      {p.active ? "Deactivate" : "Reactivate"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <input value={search} onChange={function (e) { setSearch(e.target.value); }}
          placeholder="Search name, phone, or plate"
          style={{
            width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1.5px solid rgba(143,166,184,0.25)",
            background: "rgba(255,255,255,0.04)", padding: "12px 14px", fontSize: 15, color: PAPER,
            outline: "none", fontFamily: "inherit", marginBottom: 10,
          }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={fleetOnly} onChange={function (e) { setFleetOnly(e.target.checked); }}
            style={{ width: 16, height: 16, cursor: "pointer" }} />
          <span style={{ fontSize: 13, color: CHROME }}>Fleet vehicles only</span>
        </label>

        {filteredRows.length === 0 && (
          <div style={{ fontSize: 13, color: CHROME, textAlign: "center", padding: 20 }}>
            {customerRows.length === 0 ? "No customers have brought a vehicle in yet." : "No matches."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredRows.map(function (row) {
            var c = row.customer;
            return (
              <div key={c.id} onClick={function () { setSelectedId(c.id); }} style={Object.assign({}, panelStyle, {
                marginBottom: 0, padding: "14px 16px", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              })}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{c.name}</span>
                    <LoyaltyBadge customer={c} size="sm" />
                  </div>
                  <div style={{ fontSize: 12, color: CHROME }}>
                    {c.phone} · {row.vehicles.length} vehicle{row.vehicles.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: SIGNAL }}>{money(c.total_spend)}</div>
                  <div style={{ fontSize: 10, color: CHROME }}>{c.visit_count || 0} visits</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
