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
import { db } from "../../lib/db";
import LoyaltyBadge from "../../components/LoyaltyBadge";
import VehiclePhotoUpload from "../../components/VehiclePhotoUpload";
import { INK, STEEL, CHROME, SIGNAL, PAPER } from "./theme";

function money(n) {
  return "KSh " + Math.round(n || 0).toLocaleString();
}

export default function CustomersPage() {
  var vehiclesState = useState([]); var vehicles = vehiclesState[0]; var setVehicles = vehiclesState[1];
  var jobsState = useState([]); var jobs = jobsState[0]; var setJobs = jobsState[1];
  var jobServicesState = useState([]); var jobServices = jobServicesState[0]; var setJobServices = jobServicesState[1];
  var staffState = useState([]); var staff = staffState[0]; var setStaff = staffState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var searchState = useState(""); var search = searchState[0]; var setSearch = searchState[1];
  var selectedIdState = useState(null); var selectedId = selectedIdState[0]; var setSelectedId = selectedIdState[1];
  var selectedVehicleIdState = useState(null); var selectedVehicleId = selectedVehicleIdState[0]; var setSelectedVehicleId = selectedVehicleIdState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_vehicles", null, "?select=*,customers(*)&order=created_at.desc"),
      db("GET", "auto_jobs", null, "?status=eq.completed&order=completed_at.desc&select=*,auto_vehicles(reg_number,make)"),
      db("GET", "auto_job_services", null, "?select=*,auto_services(name)"),
      db("GET", "staff", null, "?order=name.asc"),
    ]);
    setVehicles(results[0] || []);
    setJobs(results[1] || []);
    setJobServices(results[2] || []);
    setStaff(results[3] || []);
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
  var filteredRows = q === "" ? customerRows : customerRows.filter(function (row) {
    var c = row.customer;
    var nameMatch = (c.name || "").toLowerCase().indexOf(q) !== -1;
    var phoneMatch = (c.phone || "").toLowerCase().indexOf(q) !== -1;
    var plateMatch = row.vehicles.some(function (v) { return (v.reg_number || "").toLowerCase().indexOf(q) !== -1; });
    return nameMatch || phoneMatch || plateMatch;
  });

  var staffById = {};
  staff.forEach(function (s) { staffById[s.id] = s; });

  var selected = selectedId ? customersById[selectedId] : null;
  var theirJobs = selected ? jobs.filter(function (j) { return j.customer_id === selectedId; }) : [];

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
                      <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>
                        {[v.reg_number, v.make, v.model, v.color].filter(Boolean).join(" · ")}
                      </div>
                      <div style={{ fontSize: 11, color: CHROME }}>{isExpanded ? "Hide photos ▲" : "Photos ▼"}</div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: "10px 12px", borderTop: "1px solid " + CHROME + "22" }}>
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
        <input value={search} onChange={function (e) { setSearch(e.target.value); }}
          placeholder="Search name, phone, or plate"
          style={{
            width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1.5px solid rgba(143,166,184,0.25)",
            background: "rgba(255,255,255,0.04)", padding: "12px 14px", fontSize: 15, color: PAPER,
            outline: "none", fontFamily: "inherit", marginBottom: 16,
          }} />

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
