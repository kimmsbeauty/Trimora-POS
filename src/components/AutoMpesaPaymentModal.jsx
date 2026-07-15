// src/components/AutoMpesaPaymentModal.jsx
//
// Trimora Auto's M-Pesa payment collection -- the automated Daraja STK
// Push flow, same infrastructure POSApp.jsx already uses for salon
// checkout (Till/Buy Goods only; Paybill and Send Money are POS's
// separate staff-confirmed flow via MpesaPaymentModal.jsx, and are
// deliberately out of scope here). Pulled into its own component rather
// than inlined in BoardPage.jsx since the push+poll logic is a
// self-contained unit with its own lifecycle (idle -> sending ->
// waiting -> confirmed/failed).
//
// Requires `job_id` support in the mpesa-stk-push Edge Function
// (added alongside this component) so the resulting salon_mpesa_payments
// row is linked back to the job -- unlike POS, where the sale record is
// created only *after* payment confirms so no back-link is needed, an
// Auto job already exists by the time payment happens.

import { useState, useEffect, useRef } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/constants";
import { getValidAccessToken } from "../lib/deviceAuth";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "../pages/auto/theme";

function money(n) {
  return "KSh " + (n || 0).toLocaleString();
}

export default function AutoMpesaPaymentModal({ salon, job, onPaid, onCancel }) {
  var phaseState = useState("idle"); // idle | sending | waiting | confirmed | failed
  var phase = phaseState[0]; var setPhase = phaseState[1];
  var errorState = useState(""); var error = errorState[0]; var setError = errorState[1];
  var pollTimerRef = useRef(null);

  var customerPhone = (job.customers && job.customers.phone) || "";
  var amount = job.total_price || 0;

  useEffect(function () {
    return function () {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  function startPolling(checkoutRequestId) {
    var attempts = 0;
    var maxAttempts = 40; // 40 x 3s = 120s, matches POS's checkout flow

    var timer = setInterval(async function () {
      attempts++;
      try {
        var rows = await fetch(
          SUPABASE_URL + "/rest/v1/salon_mpesa_payments?checkout_request_id=eq." +
          encodeURIComponent(checkoutRequestId) + "&select=status,mpesa_receipt,result_desc&limit=1",
          { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
        ).then(function (r) { return r.json(); });

        var row = rows && rows[0];
        if (row) {
          if (row.status === "confirmed") {
            clearInterval(timer); pollTimerRef.current = null;
            setPhase("confirmed");
            setTimeout(function () { onPaid("Till"); }, 1200);
            return;
          }
          if (row.status === "failed") {
            clearInterval(timer); pollTimerRef.current = null;
            setError(row.result_desc || "Payment was not completed. Please try again.");
            setPhase("failed");
            return;
          }
        }
      } catch (err) {
        console.error("Auto payment polling error:", err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer); pollTimerRef.current = null;
        setError("Payment timed out. Ask the customer to try again, or collect cash.");
        setPhase("failed");
      }
    }, 3000);

    pollTimerRef.current = timer;
  }

  async function initiateStkPush() {
    if (!customerPhone) {
      setError("No phone number on file for this customer -- collect cash instead.");
      setPhase("failed");
      return;
    }
    if (!salon || !salon.id) {
      setError("Salon context unavailable.");
      setPhase("failed");
      return;
    }

    setPhase("sending");
    setError("");

    try {
      var deviceToken = await getValidAccessToken();
      var res = await fetch(SUPABASE_URL + "/functions/v1/mpesa-stk-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + (deviceToken || SUPABASE_KEY),
        },
        body: JSON.stringify({
          salon_id:  salon.id,
          amount:    Math.ceil(amount),
          phone:     customerPhone,
          reference: ((job.customers && job.customers.name) || "AutoJob").slice(0, 12),
          job_id:    job.id,
        }),
      });

      var data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "STK Push failed. Try again, or collect cash.");
        setPhase("failed");
        return;
      }

      setPhase("waiting");
      startPolling(data.checkout_request_id);

    } catch (err) {
      console.error("Auto STK push error:", err);
      setError("Network error sending STK push. Try again, or collect cash.");
      setPhase("failed");
    }
  }

  function stop() {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    onCancel();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: STEEL, borderRadius: 16, padding: 28, maxWidth: 380, width: "100%", border: "1px solid " + CHROME + "44" }}>
        <div style={{ fontSize: 13, color: CHROME, marginBottom: 4 }}>M-Pesa Payment</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: PAPER, marginBottom: 4 }}>{money(amount)}</div>
        <div style={{ fontSize: 13, color: CHROME, marginBottom: 20 }}>
          {(job.customers && job.customers.name) || "Customer"} · {customerPhone || "no phone on file"}
        </div>

        {phase === "idle" && (
          <>
            <button onClick={initiateStkPush} disabled={!customerPhone}
              style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: customerPhone ? SIGNAL : CHROME + "55", color: INK, fontWeight: 800, fontSize: 15, cursor: customerPhone ? "pointer" : "not-allowed", marginBottom: 10 }}>
              Send STK Push
            </button>
            <button onClick={stop} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid " + CHROME + "55", background: "transparent", color: CHROME, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Cancel
            </button>
          </>
        )}

        {phase === "sending" && (
          <div style={{ textAlign: "center", padding: "16px 0", color: PAPER }}>Sending payment request…</div>
        )}

        {phase === "waiting" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ color: PAPER, marginBottom: 8 }}>Waiting for customer to enter M-Pesa PIN…</div>
            <div style={{ color: CHROME, fontSize: 13 }}>This can take up to 2 minutes.</div>
          </div>
        )}

        {phase === "confirmed" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ color: SIGNAL, fontWeight: 800 }}>Payment confirmed</div>
          </div>
        )}

        {phase === "failed" && (
          <>
            <div style={{ color: ALERT, fontSize: 13, marginBottom: 16 }}>{error}</div>
            <button onClick={initiateStkPush} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: SIGNAL, color: INK, fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
              Try Again
            </button>
            <button onClick={stop} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid " + CHROME + "55", background: "transparent", color: CHROME, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Cancel — Collect Cash Instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}
