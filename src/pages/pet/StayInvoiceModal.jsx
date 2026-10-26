// src/pages/pet/StayInvoiceModal.jsx
//
// "Bill this stay" for one checked-out boarding stay. The suggestion (nights, late days, rate)
// comes from the database (pet_stay_billing). Staff can reduce the late days (0 = waive) and add a
// discount, then pet_invoice_stay creates the invoice from the rate saved on the stay. Policy: the
// full booked stay is always charged; each late day is one extra night.
import React, { useEffect, useRef, useState } from "react";
import { dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, FOREGROUND } from "./theme";
import { newIdempotencyKey } from "./invoiceData";
import { clampLateDays, previewTotals, stayBillingErrorMessage } from "./stayBillingData";
import { Button, Field, ErrorLine, Modal, Badge, inputStyle } from "./ui";

export default function StayInvoiceModal({ stay, petName, ownerName, onClose, onCreated }) {
  var infoS = useState(null); var info = infoS[0]; var setInfo = infoS[1];
  var loadS = useState("loading"); var load = loadS[0]; var setLoad = loadS[1]; // loading | ready | error
  var lateS = useState("0"); var late = lateS[0]; var setLate = lateS[1];
  var dTypeS = useState("amount"); var dType = dTypeS[0]; var setDType = dTypeS[1];
  var dValS = useState(""); var dVal = dValS[0]; var setDVal = dValS[1];
  var notesS = useState(""); var notes = notesS[0]; var setNotes = notesS[1];
  var busyS = useState(false); var busy = busyS[0]; var setBusy = busyS[1];
  var errS = useState(""); var err = errS[0]; var setErr = errS[1];
  var doneS = useState(null); var done = doneS[0]; var setDone = doneS[1];
  var keyRef = useRef(newIdempotencyKey());
  var alive = useRef(true);

  useEffect(function () {
    alive.current = true;
    dbRpcAuth("pet_stay_billing", { p_stay_id: stay.id }).then(function (res) {
      if (!alive.current) return;
      var row = res && Array.isArray(res.data) ? res.data[0] : null;
      if (res.error || !row) { setErr(stayBillingErrorMessage(res && res.error)); setLoad("error"); return; }
      setInfo(row); setLate(String(row.late_days)); setLoad("ready");
    });
    return function () { alive.current = false; };
  }, [stay.id]);

  var t = info ? previewTotals({ nights: info.nights, rate: info.nightly_rate, lateDays: late, maxLateDays: info.late_days, discountType: dType, discountValue: dVal }) : null;

  async function create() {
    setBusy(true); setErr("");
    var res = await dbRpcAuth("pet_invoice_stay", {
      p_idempotency_key: keyRef.current, p_stay_id: stay.id, p_late_days: t.lateDays,
      p_discount_type: dType, p_discount_value: Number(dVal) || 0, p_due_date: null, p_notes: notes,
    });
    if (!alive.current) return;
    setBusy(false);
    if (res.error) { setErr(stayBillingErrorMessage(res.error)); return; }
    setDone(res.data); onCreated();
  }

  var already = info && info.invoice_id;
  var footer = done || already ? (
    <Button onClick={onClose}>Close</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Not now</Button>
      <Button onClick={create} disabled={busy || load !== "ready" || !t || t.total <= 0}>{busy ? "Creating…" : "Create invoice"}</Button>
    </>
  );

  return (
    <Modal open onClose={busy ? function () {} : onClose} title={"Bill " + petName + "'s stay"} description={ownerName} footer={footer}>
      {load === "loading" ? <div style={{ color: MUTED_FG, fontSize: 13 }}>Working out the charge…</div> : null}
      {load === "error" ? <ErrorLine>{err}</ErrorLine> : null}
      {done ? <div style={{ fontSize: 14, color: FOREGROUND }}>The invoice has been created. You'll find it under Invoices, where you can take payment.</div> : null}
      {!done && already ? <div style={{ fontSize: 14, color: FOREGROUND }}>This stay is already billed on invoice <strong>{info.invoice_number}</strong>.</div> : null}
      {!done && !already && load === "ready" && t ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, color: MUTED_FG }}>
            Checked out {info.checked_out_on}. The full booked stay is always charged, even when the pet leaves early.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, fontSize: 14 }}>
            <span>{info.nights} {info.nights === 1 ? "night" : "nights"} x {fmt(info.nightly_rate)}</span><span>{fmt(t.nightsTotal)}</span>
            {info.late_days > 0 ? <><span>{t.lateDays} late {t.lateDays === 1 ? "day" : "days"} x {fmt(info.nightly_rate)}</span><span>{fmt(t.lateTotal)}</span></> : null}
            {t.discount > 0 ? <><span>Discount</span><span>- {fmt(t.discount)}</span></> : null}
            <strong>Total</strong><strong>{fmt(t.total)}</strong>
          </div>
          {info.late_days > 0 ? (
            <Field label={"Late days to charge (up to " + info.late_days + ")"} htmlFor="stay-late">
              <input id="stay-late" type="number" min={0} max={info.late_days} inputMode="numeric" style={inputStyle} value={late}
                onChange={function (e) { setLate(e.target.value); }} onBlur={function () { setLate(String(clampLateDays(late, info.late_days))); }} />
            </Field>
          ) : <Badge tone="success">Collected on time</Badge>}
          {info.late_days > 0 && t.lateDays === 0 ? <Badge tone="warning">Late charge waived</Badge> : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Discount (optional)" htmlFor="stay-disc">
              <input id="stay-disc" inputMode="numeric" style={inputStyle} value={dVal} onChange={function (e) { setDVal(e.target.value); }} />
            </Field>
            <Field label="Discount type" htmlFor="stay-disc-type">
              <select id="stay-disc-type" style={inputStyle} value={dType} onChange={function (e) { setDType(e.target.value); }}>
                <option value="amount">Amount (KES)</option><option value="percent">Percent</option>
              </select>
            </Field>
          </div>
          <Field label="Note for the invoice (optional)" htmlFor="stay-inv-notes"><textarea id="stay-inv-notes" rows={2} style={inputStyle} value={notes} onChange={function (e) { setNotes(e.target.value); }} /></Field>
          <ErrorLine>{err}</ErrorLine>
        </div>
      ) : null}
    </Modal>
  );
}
