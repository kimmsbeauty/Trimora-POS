// src/pages/pet/DaycareCheckoutModal.jsx
//
// Check out one daycare visit that is ready for pickup. The charge comes from the database
// (pet_daycare_billing); pet_daycare_checkout then records the pickup (time + staff member), completes
// the visit and creates the invoice in ONE transaction, using the existing invoice tables. Payment is
// taken afterwards in Invoices & Payments like any other invoice. The booked visit is always charged;
// late-pickup hours appear only if the business switched that rule on, and staff can reduce them (never raise).
import React, { useEffect, useRef, useState } from "react";
import { dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, FOREGROUND } from "./theme";
import { newIdempotencyKey } from "./invoiceData";
import { PLAN_LABELS, timeLabel, clampLateHours, previewTotals, daycareErrorMessage, durationLabel } from "./daycareData";
import { Button, Field, ErrorLine, Modal, Badge, inputStyle } from "./ui";

export default function DaycareCheckoutModal({ visit, petName, ownerName, onClose, onDone, onOpenInvoice }) {
  var infoS = useState(null); var info = infoS[0]; var setInfo = infoS[1];
  var loadS = useState("loading"); var load = loadS[0]; var setLoad = loadS[1];
  var lateS = useState("0"); var late = lateS[0]; var setLate = lateS[1];
  var dTypeS = useState("amount"); var dType = dTypeS[0]; var setDType = dTypeS[1];
  var dValS = useState(""); var dVal = dValS[0]; var setDVal = dValS[1];
  var notesS = useState(""); var notes = notesS[0]; var setNotes = notesS[1];
  var busyS = useState(false); var busy = busyS[0]; var setBusy = busyS[1];
  var errS = useState(""); var err = errS[0]; var setErr = errS[1];
  var doneS = useState(null); var done = doneS[0]; var setDone = doneS[1]; // { invoiceId }
  var keyRef = useRef(newIdempotencyKey());
  var alive = useRef(true);

  useEffect(function () {
    alive.current = true;
    dbRpcAuth("pet_daycare_billing", { p_visit_id: visit.id }).then(function (res) {
      if (!alive.current) return;
      var row = res && Array.isArray(res.data) ? res.data[0] : null;
      if (res.error || !row) { setErr(daycareErrorMessage(res && res.error)); setLoad("error"); return; }
      setInfo(row); setLate(String(row.late_hours)); setLoad("ready");
    });
    return function () { alive.current = false; };
  }, [visit.id]);

  var t = info ? previewTotals(info, late, dType, dVal) : null;

  async function checkout() {
    setBusy(true); setErr("");
    var res = await dbRpcAuth("pet_daycare_checkout", {
      p_idempotency_key: keyRef.current, p_visit_id: visit.id, p_late_hours: t.lateHours,
      p_discount_type: dType, p_discount_value: Number(dVal) || 0, p_due_date: null, p_notes: notes,
    });
    if (!alive.current) return;
    setBusy(false);
    if (res.error) { setErr(daycareErrorMessage(res.error)); return; }
    setDone({ invoiceId: res.data || null }); onDone();
  }

  var footer = done ? (
    <>
      {done.invoiceId ? <Button variant="outline" onClick={function () { onOpenInvoice(done.invoiceId); }}>Open invoice</Button> : null}
      <Button onClick={onClose}>Close</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Not now</Button>
      <Button onClick={checkout} disabled={busy || load !== "ready" || !t || !!(info && info.invoice_id)}>{busy ? "Checking out…" : "Check out & invoice"}</Button>
    </>
  );

  return (
    <Modal open onClose={busy ? function () {} : onClose} title={"Check out " + petName} description={ownerName} footer={footer}>
      {load === "loading" ? <div style={{ color: MUTED_FG, fontSize: 13 }}>Working out the charge…</div> : null}
      {load === "error" ? <ErrorLine>{err}</ErrorLine> : null}
      {done ? (
        <div style={{ fontSize: 14, color: FOREGROUND }}>
          {petName} has been collected and the visit is complete.{" "}
          {done.invoiceId ? "The invoice is under Invoices & Payments, where you can take payment." : "There was nothing to charge, so no invoice was needed."}
        </div>
      ) : null}
      {!done && info && info.invoice_id ? <div style={{ fontSize: 14 }}>This visit is already billed on invoice <strong>{info.invoice_number}</strong>.</div> : null}
      {!done && load === "ready" && t && !info.invoice_id ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, color: MUTED_FG }}>
            {PLAN_LABELS[info.plan]} · scheduled {timeLabel(visit.scheduled_start)}–{timeLabel(info.scheduled_end)} ({durationLabel(visit.scheduled_start, info.scheduled_end)}).
            Arrived {timeLabel(visit.checked_in_at)}. Picked up now. The booked visit is always charged, even when the pet leaves early.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, fontSize: 14 }}>
            <span>{info.service_name} {info.plan === "hourly" ? "× " + info.units + (info.units === 1 ? " hour" : " hours") : ""} @ {fmt(info.unit_price)}</span><span>{fmt(t.base)}</span>
            {info.late_hours > 0 ? <><span>{t.lateHours} late {t.lateHours === 1 ? "hour" : "hours"} × {fmt(info.late_unit_price)}</span><span>{fmt(t.lateTotal)}</span></> : null}
            {t.discount > 0 ? <><span>Discount</span><span>- {fmt(t.discount)}</span></> : null}
            <strong>Total</strong><strong>{fmt(t.total)}</strong>
          </div>
          {info.minutes_overdue > 0 && !info.late_fee_enabled ? <Badge tone="neutral">{info.minutes_overdue} min past scheduled pickup · no late fee is set up</Badge> : null}
          {info.late_hours > 0 ? (
            <Field label={"Late hours to charge (up to " + info.late_hours + ")"} htmlFor="dc-late">
              <input id="dc-late" type="number" min={0} max={info.late_hours} inputMode="numeric" style={inputStyle} value={late}
                onChange={function (e) { setLate(e.target.value); }} onBlur={function () { setLate(String(clampLateHours(late, info.late_hours))); }} />
            </Field>
          ) : null}
          {info.late_hours > 0 && t.lateHours === 0 ? <Badge tone="warning">Late charge waived</Badge> : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Discount (optional)" htmlFor="dc-disc"><input id="dc-disc" inputMode="numeric" style={inputStyle} value={dVal} onChange={function (e) { setDVal(e.target.value); }} /></Field>
            <Field label="Discount type" htmlFor="dc-disc-type">
              <select id="dc-disc-type" style={inputStyle} value={dType} onChange={function (e) { setDType(e.target.value); }}>
                <option value="amount">Amount (KES)</option><option value="percent">Percent</option>
              </select>
            </Field>
          </div>
          <Field label="Note for the invoice (optional)" htmlFor="dc-notes"><textarea id="dc-notes" rows={2} style={inputStyle} value={notes} onChange={function (e) { setNotes(e.target.value); }} /></Field>
          <ErrorLine>{err}</ErrorLine>
        </div>
      ) : null}
    </Modal>
  );
}
