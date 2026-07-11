// src/components/AutoExportButton.jsx
//
// Matches POS's ExportButton.jsx: same plain-browser CSV/Blob download
// mechanism (no library, nothing to install), same two-report pattern
// (an itemized report + a commission summary). downloadCSV() itself
// isn't exported from ExportButton.jsx, so it's replicated here rather
// than imported -- it's ~15 dependency-free lines, and duplicating it
// keeps Auto's screens self-contained the same way StaffPage/
// ServicesPage/ExpensesPage all are, rather than reaching into POS's
// component for an unexported internal.

import { useState } from "react";
import { INK, STEEL, CHROME, SIGNAL, PAPER } from "../pages/auto/theme";

function downloadCSV(filename, rows) {
  var csv = rows.map(function (row) {
    return row.map(function (cell) {
      var val = cell == null ? "" : String(cell);
      if (val.indexOf(",") !== -1 || val.indexOf('"') !== -1 || val.indexOf("\n") !== -1) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(",");
  }).join("\n");

  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildJobsCSV(jobs, jobServices, staffById, rangeLabel, salonName) {
  var header = ["Date", "Time", "Vehicle", "Customer", "Staff", "Payment Method", "Payment Status",
    "Subtotal (KSh)", "Discount (KSh)", "Total (KSh)", "Commission (KSh)", "Services"];

  var rows = jobs.map(function (j) {
    var completed = j.completed_at ? new Date(j.completed_at) : null;
    var vehicle = j.auto_vehicles || {};
    var vehicleLabel = [vehicle.reg_number, vehicle.make].filter(Boolean).join(" · ");
    var staffMember = staffById[j.assigned_staff_id];
    var lines = jobServices.filter(function (js) { return js.job_id === j.id; });
    // Feature-parity item #8: annotate each service with its own staff
    // when it differs from the job's overall assignee -- a job can have
    // different people credited for different services.
    var services = lines.map(function (js) {
      var name = (js.auto_services && js.auto_services.name) || "Service";
      var lineStaff = staffById[js.staff_id];
      if (lineStaff && (!staffMember || lineStaff.id !== staffMember.id)) {
        return name + " (" + lineStaff.name + ")";
      }
      return name;
    }).join(" | ");
    var discountAmount = j.discount_amount || 0;
    return [
      completed ? completed.toLocaleDateString("en-KE") : "",
      completed ? completed.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : "",
      vehicleLabel,
      (j.customers && j.customers.name) || "",
      staffMember ? staffMember.name : "",
      j.payment_method || "",
      j.payment_status || "",
      j.total_price != null ? j.total_price : "",
      discountAmount || "",
      (j.total_price || 0) - discountAmount,
      j.commission != null ? j.commission : "",
      services,
    ];
  });

  var totalRow = ["TOTAL", "", "", "", "", "", "",
    jobs.reduce(function (a, j) { return a + (j.total_price || 0); }, 0),
    jobs.reduce(function (a, j) { return a + (j.discount_amount || 0); }, 0),
    jobs.reduce(function (a, j) { return a + ((j.total_price || 0) - (j.discount_amount || 0)); }, 0),
    jobs.reduce(function (a, j) { return a + (j.commission || 0); }, 0),
    "",
  ];

  return [
    [(salonName || "Trimora Auto") + " — Jobs Report"],
    ["Period: " + rangeLabel],
    ["Generated: " + new Date().toLocaleString("en-KE")],
    [],
    header,
  ].concat(rows).concat([[], totalRow]);
}

function buildCommissionCSV(staffRows, rangeLabel, salonName) {
  var header = ["Staff", "Jobs", "Revenue (KSh)", "Commission (KSh)"];
  var rows = staffRows.map(function (s) {
    return [s.name, s.count, s.revenue, s.commission];
  });
  var totalCommission = staffRows.reduce(function (a, s) { return a + (s.commission || 0); }, 0);

  return [
    [(salonName || "Trimora Auto") + " — Commission Summary"],
    ["Period: " + rangeLabel],
    ["Generated: " + new Date().toLocaleString("en-KE")],
    [],
    header,
  ].concat(rows).concat([
    [],
    ["TOTAL COMMISSION PAYABLE", "", "", totalCommission],
  ]);
}

export default function AutoExportButton({ jobs, jobServices, staffById, staffRows, rangeLabel, salonName }) {
  var openState = useState(false); var open = openState[0]; var setOpen = openState[1];

  function exportJobs() {
    downloadCSV("trimora-auto-jobs-" + new Date().toISOString().split("T")[0] + ".csv",
      buildJobsCSV(jobs, jobServices, staffById, rangeLabel, salonName));
    setOpen(false);
  }

  function exportCommission() {
    downloadCSV("trimora-auto-commission-" + new Date().toISOString().split("T")[0] + ".csv",
      buildCommissionCSV(staffRows, rangeLabel, salonName));
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={function () { setOpen(!open); }} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20,
        border: "1.5px solid " + SIGNAL, background: "transparent", color: SIGNAL,
        fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}>
        ⬇️ Export {jobs.length > 0 ? "(" + jobs.length + ")" : ""}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, background: STEEL, borderRadius: 12,
          padding: 8, border: "1px solid " + CHROME + "44", zIndex: 200, minWidth: 200,
        }}>
          {jobs.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: CHROME, textAlign: "center" }}>No jobs in selected period</div>
          ) : (
            <div>
              <div onClick={exportJobs} style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>Jobs Report</div>
                <div style={{ fontSize: 11, color: CHROME }}>Itemized breakdown · CSV</div>
              </div>
              <div style={{ height: 1, background: CHROME + "33", margin: "4px 0" }} />
              <div onClick={exportCommission} style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>Commission Summary</div>
                <div style={{ fontSize: 11, color: CHROME }}>Per-staff payroll · CSV</div>
              </div>
            </div>
          )}
        </div>
      )}

      {open && <div onClick={function () { setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 199 }} />}
    </div>
  );
}
