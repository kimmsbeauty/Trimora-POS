// src/pages/pet/MpesaStkPush.jsx
//
// "Send M-Pesa request" for one Pet invoice. Starts the push through the existing
// mpesa-stk-push Edge Function (Till / Buy Goods), then polls pet_mpesa_status. When
// the database reports the push CONFIRMED, pet_record_mpesa_payment records it on the
// invoice -- the amount and receipt come from the confirmed row, not from this screen.
//
// Also lists confirmed pushes that were never recorded (browser closed after the
// customer paid) so staff can record them with one click.
import React, { useEffect, useRef, useState } from "react";
import { dbRpcAuth } from "../../lib/db";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/constants";
import { getValidAccessToken } from "../../lib/deviceAuth";
import { fmt } from "../../lib/utils";
import { MUTED_FG, FOREGROUND } from "./theme";
import { invoiceErrorMessage } from "./invoiceData";
import { POLL_MS, MAX_POLLS, normalizeKenyanPhone, interpretStatus, mpesaErrorMessage } from "./mpesaData";
import { Button, Field, ErrorLine, inputStyle } from "./ui";

export default function MpesaStkPush({ salonId, invoice, owed, defaultPhone, reference, onRecorded }) {
  var phoneS = useState(defaultPhone || ""); var phone = phoneS[0]; var setPhone = phoneS[1];
  var amountS = useState(String(owed)); var amount = amountS[0]; var setAmount = amountS[1];
  var phaseS = useState("idle"); var phase = phaseS[0]; var setPhase = phaseS[1]; // idle | sending | waiting | recording | failed
  var errS = useState(""); var err = errS[0]; var setErr = errS[1];
  var pendingS = useState([]); var pending = pendingS[0]; var setPending = pendingS[1];
  var timer = useRef(null);
  var alive = useRef(true);

  useEffect(function () {
    alive.current = true;
    dbRpcAuth("pet_mpesa_unrecorded", { p_invoice_id: invoice.id }).then(function (res) {
      if (alive.current && res && Array.isArray(res.data)) setPending(res.data);
    });
    return function () { alive.current = false; if (timer.current) clearInterval(timer.current); };
  }, [invoice.id]);

  function stopTimer() { if (timer.current) { clearInterval(timer.current); timer.current = null; } }

  async function record(checkoutId) {
    setPhase("recording");
    var res = await dbRpcAuth("pet_record_mpesa_payment", { p_invoice_id: invoice.id, p_checkout_request_id: checkoutId });
    if (!alive.current) return;
    if (res.error) { setErr(invoiceErrorMessage(res.error)); setPhase("failed"); return; }
    setPhase("idle"); setPending([]);
    onRecorded();
  }

  function poll(checkoutId) {
    var n = 0;
    stopTimer();
    timer.current = setInterval(async function () {
      n += 1;
      var res = await dbRpcAuth("pet_mpesa_status", { p_checkout_request_id: checkoutId });
      if (!alive.current) return;
      var s = interpretStatus(res && res.data);
      if (s.state === "confirmed") { stopTimer(); record(checkoutId); return; }
      if (s.state === "failed") { stopTimer(); setErr(s.reason || "The customer didn't complete the payment."); setPhase("failed"); return; }
      if (n >= MAX_POLLS) { stopTimer(); setErr("No answer yet. If the customer says they paid, wait a minute and use \"Check again\"."); setPhase("failed"); }
    }, POLL_MS);
  }

  async function send() {
    var amt = Number(amount);
    var p = normalizeKenyanPhone(phone);
    if (!p) { setErr("Enter a valid Safaricom number, for example 0712 345 678."); return; }
    if (!amount || !isFinite(amt) || Math.floor(amt) !== amt || amt <= 0) { setErr("Enter a positive whole amount."); return; }
    if (amt > owed) { setErr("The amount is more than is still owed."); return; }
    setPhase("sending"); setErr("");
    try {
      var token = await getValidAccessToken();
      var res = await fetch(SUPABASE_URL + "/functions/v1/mpesa-stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (token || SUPABASE_KEY) },
        body: JSON.stringify({ salon_id: salonId, amount: amt, phone: p, reference: String(reference || "Invoice").slice(0, 12), pet_invoice_id: invoice.id }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!alive.current) return;
      if (!res.ok || !data.success) { setErr(mpesaErrorMessage(data.error)); setPhase("failed"); return; }
      setPhase("waiting");
      poll(data.checkout_request_id);
    } catch (e) {
      if (alive.current) { setErr(mpesaErrorMessage("Network error")); setPhase("failed"); }
    }
  }

  var busy = phase === "sending" || phase === "waiting" || phase === "recording";
  return (
    <div>
      {pending.map(function (p) {
        return (
          <div key={p.checkout_request_id} style={{ marginBottom: 10, padding: 10, borderRadius: 10, border: "1px solid #E1AC41", background: "#F3ECDB", fontSize: 13, color: FOREGROUND }}>
            A confirmed M-Pesa payment of {fmt(p.amount)} ({p.mpesa_receipt}) isn't on this invoice yet.{" "}
            <Button size="sm" onClick={function () { record(p.checkout_request_id); }} disabled={busy}>Record it</Button>
          </div>
        );
      })}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
        <Field label="Customer's M-Pesa number" htmlFor="stk-phone"><input id="stk-phone" inputMode="tel" style={inputStyle} value={phone} disabled={busy} onChange={function (e) { setPhone(e.target.value); }} /></Field>
        <Field label="Amount to request (KES)" htmlFor="stk-amount"><input id="stk-amount" inputMode="numeric" style={inputStyle} value={amount} disabled={busy} onChange={function (e) { setAmount(e.target.value); }} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <Button size="sm" onClick={send} disabled={busy}>{phase === "sending" ? "Sending…" : "Send M-Pesa request"}</Button>
        {phase === "waiting" ? <span style={{ fontSize: 12, color: MUTED_FG }}>Waiting for the customer to enter their M-Pesa PIN… up to 2 minutes.</span> : null}
        {phase === "recording" ? <span style={{ fontSize: 12, color: MUTED_FG }}>Payment confirmed. Recording it…</span> : null}
      </div>
      <ErrorLine>{err}</ErrorLine>
    </div>
  );
}
