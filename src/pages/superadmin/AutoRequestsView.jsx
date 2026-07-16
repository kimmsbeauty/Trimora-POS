import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM, GREEN, GRAY } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "autorequests") --
// mechanical extraction only, JSX body below is byte-identical to the
// original inline block, no logic changes. All handlers/state are
// passed down as the same values the parent already owned there.
export default function AutoRequestsView({
  setView, autoRequestsLoading, autoOnboardingRequests,
  autoApprovingId, approveAutoRequest,
  autoRejectModal, setAutoRejectModal, autoRejectReason, setAutoRejectReason, rejectAutoRequest,
  setAddRepModal, setAddRepEmail, setAddRepPass, setAddRepError,
}) {
  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("carwashes"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>🧑‍💼 Auto Requests</div>
            <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>Car wash onboarding requests, separate from salon requests</div>
          </div>
          <button onClick={function() { setAddRepModal(true); setAddRepEmail(""); setAddRepPass(""); setAddRepError(""); }}
            style={{ background: "none", border: "1px solid " + GOLD_DIM + "66", color: GOLD, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Add Sales Rep
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {autoRequestsLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : autoOnboardingRequests.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>No Auto onboarding requests yet.</div>
        ) : (
          autoOnboardingRequests.map(function(r) {
            var statusMeta = {
              pending:  { bg: "#FEF3C7", fg: "#92400E", label: "🕓 Pending" },
              approved: { bg: "#D1FAE5", fg: "#065F46", label: "✅ Approved" },
              rejected: { bg: "#FEE2E2", fg: "#991B1B", label: "❌ Rejected" },
            }[r.status] || { bg: "#F5F0E8", fg: "#666", label: r.status };

            return (
              <div key={r.id} style={{ background: WHITE, borderRadius: 12, padding: 14, marginBottom: 10, border: "1.5px solid " + GOLD_DIM + "33" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{r.salon_name}</div>
                  <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: statusMeta.bg, color: statusMeta.fg }}>
                    {statusMeta.label}
                  </div>
                </div>

                {(r.owner_name || r.owner_email || r.owner_phone) && (
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                    {r.owner_name}{r.owner_name && (r.owner_email || r.owner_phone) ? " · " : ""}
                    {r.owner_email}{r.owner_email && r.owner_phone ? " · " : ""}{r.owner_phone}
                  </div>
                )}

                {r.notes && <div style={{ fontSize: 12, color: "#666", marginBottom: 8, fontStyle: "italic" }}>{r.notes}</div>}

                <div style={{ fontSize: 10, color: "#aaa", marginBottom: r.status === "pending" ? 10 : 0 }}>
                  {new Date(r.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>

                {r.status === "pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={function() { approveAutoRequest(r); }} disabled={autoApprovingId === r.id}
                      style={{ flex: 1, background: "linear-gradient(135deg," + GOLD + "," + GOLD + ")", color: BLACK, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 900, fontSize: 12, cursor: autoApprovingId === r.id ? "not-allowed" : "pointer", opacity: autoApprovingId === r.id ? 0.6 : 1 }}>
                      {autoApprovingId === r.id ? "Approving..." : "✅ Approve"}
                    </button>
                    <button onClick={function() { setAutoRejectModal(r); setAutoRejectReason(""); }}
                      style={{ flex: 1, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 900, fontSize: 12, cursor: "pointer" }}>
                      ❌ Reject
                    </button>
                  </div>
                )}

                {r.status === "approved" && r.resulting_invite_token && (
                  <div style={{ background: "#F0FDF4", border: "1px solid " + GREEN + "55", borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#065F46", fontWeight: 700, marginBottom: 4 }}>Invite link (Auto enables on completion):</div>
                    <div style={{ fontSize: 10, color: DARK, wordBreak: "break-all", fontFamily: "monospace" }}>
                      {window.location.origin + "/onboard?token=" + r.resulting_invite_token}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {autoRejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>Reject Auto Request</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>{autoRejectModal.salon_name}</div>
            <textarea
              placeholder="Reason (optional, visible to the rep)"
              value={autoRejectReason}
              onChange={function(e) { setAutoRejectReason(e.target.value); }}
              rows={3}
              style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function() { setAutoRejectModal(null); setAutoRejectReason(""); }}
                style={{ flex: 1, background: GRAY, color: DARK, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={rejectAutoRequest}
                style={{ flex: 1, background: "#EF4444", color: WHITE, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
