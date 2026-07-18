// src/components/CsvImportModal.jsx
//
// Shared UI for the "Import CSV" feature. Used by ServicesView.jsx
// (salon services), InventoryView.jsx (salon products/stock), and
// auto/ServicesPage.jsx (auto services + stock/parts) -- see
// src/lib/csvImport.js for the parsing/validation/commit logic this
// wraps.
//
// Self-styled with its own neutral overlay rather than pulling in each
// host page's theme constants (salon = gold/cream, Auto = dark/steel) --
// a modal dialog doesn't need to match the page behind it, and this
// keeps the component usable from either theme without prop-drilling
// colors through.

import { useState } from "react";
import { parseAndValidate, commitImport, downloadTemplate } from "../lib/csvImport.js";

var OVERLAY = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 };
var CARD = { background: "#FFFFFF", borderRadius: 16, padding: 20, width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box", fontFamily: "system-ui, -apple-system, sans-serif" };
var TITLE = { fontSize: 16, fontWeight: 900, color: "#1A1400", marginBottom: 4 };
var SUBTEXT = { fontSize: 12, color: "#6B7280", marginBottom: 14, lineHeight: 1.5 };
var LINK = { color: "#8A6F2E", fontWeight: 700, cursor: "pointer", fontSize: 12, textDecoration: "underline" };
var PRIMARY_BTN = { background: "#1A1400", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, fontWeight: 800, cursor: "pointer", width: "100%" };
var SECONDARY_BTN = { background: "none", border: "1px solid #D1D5DB", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer", width: "100%" };
var ROW = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, fontSize: 12, marginBottom: 4 };

function statusStyle(status) {
  if (status === "error") return { background: "#FEE2E2", color: "#B91C1C" };
  if (status === "update") return { background: "#FEF3C7", color: "#92400E" };
  return { background: "#DCFCE7", color: "#166534" };
}

function statusLabel(status) {
  if (status === "error") return "Error";
  if (status === "update") return "Update";
  return "New";
}

// existingRows: array of already-loaded rows for this salon (the host
// page already has these in state -- no extra fetch needed here) used
// for name-matching duplicates.
// onDone(result): called after a successful commit with
// { createdCount, updatedCount, failedLines } so the host page can
// refresh its own state.
export default function CsvImportModal({ open, onClose, config, entityLabel, existingRows, onDone }) {
  var fileState = useState(null); var pickedFile = fileState[0]; var setPickedFile = fileState[1];
  var rowsState = useState(null); var rows = rowsState[0]; var setRows = rowsState[1];
  var parseErrorState = useState(null); var parseError = parseErrorState[0]; var setParseError = parseErrorState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var resultState = useState(null); var result = resultState[0]; var setResult = resultState[1];

  if (!open) return null;

  function reset() {
    setPickedFile(null);
    setRows(null);
    setParseError(null);
    setBusy(false);
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setPickedFile(file);
    setRows(null);
    setParseError(null);
    setBusy(true);
    var parsed = await parseAndValidate(file, config, existingRows || []);
    setBusy(false);
    if (parsed.parseError) {
      setParseError(parsed.parseError);
      return;
    }
    setRows(parsed.rows);
  }

  async function handleConfirm() {
    var actionable = rows.filter(function (r) { return r.status !== "error"; });
    if (actionable.length === 0) return;
    setBusy(true);
    var commitResult = await commitImport(config, actionable);
    setBusy(false);
    setResult(commitResult);
    if (onDone) onDone(commitResult);
  }

  var newCount = rows ? rows.filter(function (r) { return r.status === "new"; }).length : 0;
  var updateCount = rows ? rows.filter(function (r) { return r.status === "update"; }).length : 0;
  var errorCount = rows ? rows.filter(function (r) { return r.status === "error"; }).length : 0;

  return (
    <div style={OVERLAY} onClick={function (e) { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={CARD}>
        <div style={TITLE}>Import {entityLabel} from CSV</div>

        {result ? (
          <div>
            <div style={SUBTEXT}>
              Done — {result.createdCount} created, {result.updatedCount} updated
              {result.failedLines.length > 0
                ? ", " + result.failedLines.length + " failed (rows: " + result.failedLines.join(", ") + ")"
                : "."}
            </div>
            <button style={PRIMARY_BTN} onClick={handleClose}>Close</button>
          </div>
        ) : (
          <div>
            <div style={SUBTEXT}>
              Upload a CSV to bulk-add or update {entityLabel.toLowerCase()}. Existing entries are matched by
              name and updated; new names are created.
            </div>
            <div style={{ marginBottom: 14 }}>
              <span style={LINK} onClick={function () { downloadTemplate(config); }}>Download template</span>
            </div>

            <input type="file" accept=".csv,text/csv" onChange={handleFile}
              style={{ marginBottom: 14, fontSize: 12, width: "100%" }} />

            {busy && !rows && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>Reading file…</div>}

            {parseError && (
              <div style={{ background: "#FEE2E2", color: "#B91C1C", borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 12 }}>
                {parseError}
              </div>
            )}

            {rows && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1400", marginBottom: 8 }}>
                  {rows.length} row{rows.length === 1 ? "" : "s"} — {newCount} new, {updateCount} to update
                  {errorCount > 0 ? ", " + errorCount + " with errors" : ""}
                </div>
                <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8, padding: 4 }}>
                  {rows.map(function (r) {
                    var s = statusStyle(r.status);
                    return (
                      <div key={r.line} style={Object.assign({}, ROW, { background: s.background })}>
                        <span style={{ color: s.color, fontWeight: 700 }}>
                          Row {r.line}: {r.fields.name || "(no name)"}
                        </span>
                        <span style={{ color: s.color, fontWeight: 800, fontSize: 11 }}>
                          {r.status === "error" ? r.errors.join("; ") : statusLabel(r.status)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {rows && (newCount > 0 || updateCount > 0) && (
                <button style={PRIMARY_BTN} disabled={busy} onClick={handleConfirm}>
                  {busy ? "Importing…" : "Confirm import (" + (newCount + updateCount) + ")"}
                </button>
              )}
              <button style={SECONDARY_BTN} onClick={handleClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
