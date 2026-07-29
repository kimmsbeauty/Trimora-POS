import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM, GREEN, GRAY } from "../../lib/constants";

// Extracted from SuperAdminDashboard.jsx (view === "requests") --
// mechanical extraction only, JSX body below is byte-identical to the
// original inline block, no logic changes. All handlers/state are
// passed down as the same values the parent already owned there.
export default function RequestsView({
  setView, requestsLoading, onboardingRequests,
  rejectModal, setRejectModal, rejectReason, setRejectReason, rejectRequest,
  approvingId, approveRequest,
  addRepModal, setAddRepModal, addRepEmail, setAddRepEmail,
  addRepPass, setAddRepPass, addRepError, setAddRepError,
  addRepDone, addRepLoading, addSalesRep,
  salesReps, salesRepsLoading, salesRepsLoaded,
  repActionId, repActionError,
  suspendRep, unsuspendRep,
  deleteRepModal, setDeleteRepModal,
  deleteRepLoading, deleteRep,
}) {
  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function() { setView("salons"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>🧑‍💼 Onboarding Requests</div>
            <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2 }}>Submitted by sales reps from the field</div>
          </div>
          <button onClick={function() { setAddRepModal(true); setAddRepEmail(""); setAddRepPass(""); setAddRepError(""); }}
            style={{ background: "none", border: "1px solid " + GOLD_DIM + "66", color: GOLD, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Add Sales Rep
          </button>
        </div>
      </div>

      {/* Sales rep management */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: DARK, marginBottom: 8 }}>Sales Reps</div>

        {repActionError && (
          <div style={{ color: "#EF4444", fontSize: 12, marginBottom: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>
            {repActionError}
          </div>
        )}

        {salesRepsLoading ? (
          <div style={{ textAlign: "center", padding: 20, color: "#888", fontSize: 12 }}>Loading...</div>
        ) : salesRepsLoaded && salesReps.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#888", fontSize: 12, background: WHITE, borderRadius: 12, border: "1.5px solid " + GOLD_DIM + "33" }}>
            No sales reps yet.
          </div>
        ) : (
          salesReps.map(function(rep) {
            var isBanned = rep.banned_until && new Date(rep.banned_until) > new Date();
            var busy = repActionId === rep.id;
            return (
              <div key={rep.id} style={{ background: WHITE, borderRadius: 12, padding: 14, marginBottom: 10, border: "1.5px solid " + GOLD_DIM + "33" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>{rep.email}</div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
                      Added {new Date(rep.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {rep.last_sign_in_at ? "Last signed in " + new Date(rep.last_sign_in_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : "Never signed in"}
                    </div>
                  </div>
                  <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: isBanned ? "#FEE2E2" : "#D1FAE5", color: isBanned ? "#991B1B" : "#065F46" }}>
                    {isBanned ? "⏸ Suspended" : "✅ Active"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {isBanned ? (
                    <button onClick={function() { unsuspendRep(rep); }} disabled={busy}
                      style={{ flex: 1, background: "#D1FAE5", color: "#065F46", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 900, fontSize: 12, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
                      {busy ? "Working..." : "▶ Unsuspend"}
                    </button>
                  ) : (
                    <button onClick={function() { suspendRep(rep); }} disabled={busy}
                      style={{ flex: 1, background: "#FEF3C7", color: "#92400E", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 900, fontSize: 12, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
                      {busy ? "Working..." : "⏸ Suspend"}
                    </button>
                  )}
                  <button onClick={function() { setDeleteRepModal(rep); }} disabled={busy}
                    style={{ flex: 1, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 900, fontSize: 12, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
                    🗑 Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: DARK, marginBottom: 8 }}>Onboarding Requests</div>
        {requestsLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : onboardingRequests.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>No onboarding requests yet.</div>
        ) : (
          onboardingRequests.map(function(r) {
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
                    <button onClick={function() { approveRequest(r); }} disabled={approvingId === r.id}
                      style={{ flex: 1, background: "linear-gradient(135deg," + GOLD + "," + GOLD + ")", color: BLACK, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 900, fontSize: 12, cursor: approvingId === r.id ? "not-allowed" : "pointer", opacity: approvingId === r.id ? 0.6 : 1 }}>
                      {approvingId === r.id ? "Approving..." : "✅ Approve"}
                    </button>
                    <button onClick={function() { setRejectModal(r); setRejectReason(""); }}
                      style={{ flex: 1, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 900, fontSize: 12, cursor: "pointer" }}>
                      ❌ Reject
                    </button>
                  </div>
                )}

                {r.status === "approved" && r.resulting_invite_token && (
                  <div style={{ background: "#F0FDF4", border: "1px solid " + GREEN + "55", borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#065F46", fontWeight: 700, marginBottom: 4 }}>Invite link:</div>
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

      {/* Reject reason modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>Reject Request</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>{rejectModal.salon_name}</div>
            <textarea
              placeholder="Reason (optional, visible to the rep)"
              value={rejectReason}
              onChange={function(e) { setRejectReason(e.target.value); }}
              rows={3}
              style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function() { setRejectModal(null); setRejectReason(""); }}
                style={{ flex: 1, background: GRAY, color: DARK, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={rejectRequest}
                style={{ flex: 1, background: "#EF4444", color: WHITE, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete sales rep confirmation modal */}
      {deleteRepModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>Delete Sales Rep</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>{deleteRepModal.email}</div>
            <div style={{ fontSize: 12, color: "#991B1B", marginBottom: 14, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>
              This permanently deletes the account. It cannot be undone — consider Suspend instead if you might need this rep again.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function() { setDeleteRepModal(null); }} disabled={deleteRepLoading}
                style={{ flex: 1, background: GRAY, color: DARK, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: deleteRepLoading ? "not-allowed" : "pointer" }}>
                Cancel
              </button>
              <button onClick={deleteRep} disabled={deleteRepLoading}
                style={{ flex: 1, background: "#EF4444", color: WHITE, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 900, fontSize: 13, cursor: deleteRepLoading ? "not-allowed" : "pointer", opacity: deleteRepLoading ? 0.7 : 1 }}>
                {deleteRepLoading ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add sales rep modal */}
      {addRepModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DARK, marginBottom: 4 }}>Add Sales Rep</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>They'll sign in at /sales with these credentials.</div>

            <input
              placeholder="Email"
              type="email"
              value={addRepEmail}
              onChange={function(e) { setAddRepEmail(e.target.value); setAddRepError(""); }}
              style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }}
            />
            <input
              placeholder="Temporary password"
              type="text"
              value={addRepPass}
              onChange={function(e) { setAddRepPass(e.target.value); setAddRepError(""); }}
              style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "33", padding: "10px 12px", fontSize: 13, boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" }}
            />

            {addRepError && (
              <div style={{ color: "#EF4444", fontSize: 12, marginBottom: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>
                {addRepError}
              </div>
            )}
            {addRepDone && (
              <div style={{ color: "#065F46", fontSize: 12, marginBottom: 10, padding: "8px 12px", background: "#D1FAE5", borderRadius: 8, fontWeight: 700 }}>
                ✅ Sales rep account created
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function() { setAddRepModal(false); }}
                style={{ flex: 1, background: GRAY, color: DARK, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={addSalesRep} disabled={addRepLoading}
                style={{ flex: 1, background: GOLD, color: BLACK, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 900, fontSize: 13, cursor: addRepLoading ? "not-allowed" : "pointer", opacity: addRepLoading ? 0.7 : 1 }}>
                {addRepLoading ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
