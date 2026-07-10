// src/pages/SalesRepDashboard.jsx
//
// Sales rep-facing page: submit a prospective salon's details while in
// the field, and see the status of everything you've submitted. Nothing
// here creates a salon directly -- every submission lands as 'pending'
// and only becomes real once a superadmin approves it (see
// SuperAdminDashboard.jsx's "Onboarding Requests" section). Approval
// reuses the existing create_invite() RPC -- the resulting invite link
// shows up right here once approved, so the rep can hand it to the
// salon owner without needing to go back through the superadmin.

import { useState, useEffect } from "react";
import { repFetch, salesRepLogout, getSalesRepSession } from "../lib/salesRepAuth";
import { BLACK, GOLD, GOLD_DIM, GOLD_LT, CREAM, DARK, WHITE, GREEN, RED, AMBER } from "../lib/constants";

function StatusBadge({ status }) {
  var styleFor = {
    pending:  { bg: "#FEF3C7", fg: "#92400E", label: "🕓 Pending Review" },
    approved: { bg: "#D1FAE5", fg: "#065F46", label: "✅ Approved" },
    rejected: { bg: "#FEE2E2", fg: "#991B1B", label: "❌ Rejected" },
  }[status] || { bg: "#F5F0E8", fg: "#666", label: status };

  return (
    <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: styleFor.bg, color: styleFor.fg }}>
      {styleFor.label}
    </div>
  );
}

export default function SalesRepDashboard({ onLogout }) {
  var [requests, setRequests] = useState([]);
  var [loading, setLoading] = useState(true);
  var [requestType, setRequestType] = useState("salon"); // "salon" | "auto"
  var [salonName, setSalonName] = useState("");
  var [ownerName, setOwnerName] = useState("");
  var [ownerEmail, setOwnerEmail] = useState("");
  var [ownerPhone, setOwnerPhone] = useState("");
  var [notes, setNotes] = useState("");
  var [submitting, setSubmitting] = useState(false);
  var [submitError, setSubmitError] = useState("");
  var [submitDone, setSubmitDone] = useState(false);

  var session = getSalesRepSession();
  var sessionExpired = !session;

  useEffect(function() { loadRequests(); }, []);

  // Fetches both request tables and merges them into one list, each row
  // tagged with _type so the UI can badge it -- salon_onboarding_requests
  // and auto_onboarding_requests are genuinely separate tables (not one
  // table with a module flag), so this is a real merge, not a filter.
  async function loadRequests() {
    setLoading(true);
    var results = await Promise.all([
      repFetch("GET", "salon_onboarding_requests", "?order=created_at.desc"),
      repFetch("GET", "auto_onboarding_requests", "?order=created_at.desc"),
    ]);
    var salonRows = (results[0] || []).map(function(r) { return Object.assign({ _type: "salon" }, r); });
    var autoRows  = (results[1] || []).map(function(r) { return Object.assign({ _type: "auto" }, r); });
    var merged = salonRows.concat(autoRows).sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    setRequests(merged);
    setLoading(false);
  }

  function handleLogout() {
    salesRepLogout();
    onLogout();
  }

  async function handleSubmit() {
    if (!salonName.trim()) { setSubmitError("Salon name is required."); return; }
    setSubmitting(true);
    setSubmitError("");

    var body = {
      submitted_by: session.uid,
      salon_name:   salonName.trim(),
      owner_name:   ownerName.trim()  || null,
      owner_email:  ownerEmail.trim() || null,
      owner_phone:  ownerPhone.trim() || null,
      notes:        notes.trim()      || null,
    };

    var table = requestType === "auto" ? "auto_onboarding_requests" : "salon_onboarding_requests";
    var result = await repFetch("POST", table, "", body);
    setSubmitting(false);

    if (!result) {
      setSubmitError("Failed to submit. Please check your connection and try again.");
      return;
    }

    setSalonName(""); setOwnerName(""); setOwnerEmail(""); setOwnerPhone(""); setNotes("");
    setSubmitDone(true);
    setTimeout(function() { setSubmitDone(false); }, 3000);
    await loadRequests();
  }

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>🧑‍💼 Sales Rep Portal</div>
          <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>{session ? session.email : ""}</div>
        </div>
        <button onClick={handleLogout}
          style={{ background: "none", border: "1px solid " + GOLD_DIM + "66", color: GOLD_DIM, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Sign Out
        </button>
      </div>

      {sessionExpired && (
        <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "10px 16px", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
          Session expired — please sign out and sign in again.
        </div>
      )}

      <div style={{ padding: 16 }}>
        {/* Submission form */}
        <div style={{ background: WHITE, borderRadius: 14, padding: 18, marginBottom: 20, border: "1.5px solid " + GOLD_DIM + "33" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[
              { key: "salon", label: "🏪 New Salon" },
              { key: "auto",  label: "🚗 New Car Wash" },
            ].map(function(t) {
              var active = requestType === t.key;
              return (
                <button key={t.key} onClick={function() { setRequestType(t.key); }} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: active ? "none" : "1.5px solid " + GOLD_DIM + "44",
                  background: active ? GOLD : "transparent", color: active ? BLACK : GOLD_DIM,
                  fontSize: 12, fontWeight: 800, cursor: "pointer",
                }}>
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: DARK, marginBottom: 4 }}>{requestType === "auto" ? "New Car Wash Submission" : "New Salon Submission"}</div>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 14 }}>
            This goes to Trimora's superadmin for review — {requestType === "auto" ? "the car wash isn't onboarded" : "the salon isn't created"} until it's approved.
          </div>

          <input
            placeholder="Salon name *"
            value={salonName}
            onChange={function(e) { setSalonName(e.target.value); setSubmitError(""); }}
            style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }}
          />
          <input
            placeholder="Owner name"
            value={ownerName}
            onChange={function(e) { setOwnerName(e.target.value); }}
            style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }}
          />
          <input
            placeholder="Owner email"
            type="email"
            value={ownerEmail}
            onChange={function(e) { setOwnerEmail(e.target.value); }}
            style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }}
          />
          <input
            placeholder="Owner phone"
            value={ownerPhone}
            onChange={function(e) { setOwnerPhone(e.target.value); }}
            style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }}
          />
          <textarea
            placeholder="Notes — location, context from your visit, anything the superadmin should know"
            value={notes}
            onChange={function(e) { setNotes(e.target.value); }}
            rows={3}
            style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", resize: "vertical" }}
          />

          {submitError && (
            <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>
              {submitError}
            </div>
          )}

          {submitDone && (
            <div style={{ color: "#065F46", fontSize: 12, marginBottom: 10, padding: "8px 12px", background: "#D1FAE5", borderRadius: 8, fontWeight: 700 }}>
              ✅ Submitted for review
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || sessionExpired}
            style={{
              width: "100%", background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK,
              border: "none", borderRadius: 8, padding: "12px 0", fontWeight: 900, fontSize: 14,
              cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        </div>

        {/* Own submissions list */}
        <div style={{ fontSize: 14, fontWeight: 800, color: DARK, marginBottom: 10 }}>My Submissions</div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>No submissions yet.</div>
        ) : (
          requests.map(function(r) {
            return (
              <div key={r.id} style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 10, border: "1.5px solid " + GOLD_DIM + "33" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{r.salon_name}</div>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 10, background: r._type === "auto" ? "#DBEAFE" : "#F5F0E8", color: r._type === "auto" ? "#1E40AF" : "#666" }}>
                        {r._type === "auto" ? "🚗 Car Wash" : "🏪 Salon"}
                      </span>
                    </div>
                    {r.owner_name && <div style={{ fontSize: 12, color: "#888" }}>{r.owner_name}</div>}
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                {(r.owner_email || r.owner_phone) && (
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
                    {r.owner_email}{r.owner_email && r.owner_phone ? " · " : ""}{r.owner_phone}
                  </div>
                )}

                {r.notes && (
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 8, fontStyle: "italic" }}>{r.notes}</div>
                )}

                {r.status === "approved" && r.resulting_invite_token && (
                  <div style={{ background: "#F0FDF4", border: "1px solid " + GREEN + "55", borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#065F46", fontWeight: 700, marginBottom: 4 }}>Invite link — send this to the owner:</div>
                    <div style={{ fontSize: 11, color: DARK, wordBreak: "break-all", fontFamily: "monospace" }}>
                      {window.location.origin + "/onboard?token=" + r.resulting_invite_token}
                    </div>
                  </div>
                )}

                {r.status === "rejected" && r.rejection_reason && (
                  <div style={{ background: "#FEF2F2", border: "1px solid " + RED + "55", borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#991B1B", fontWeight: 700 }}>Reason: {r.rejection_reason}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
