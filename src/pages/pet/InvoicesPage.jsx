// src/pages/pet/InvoicesPage.jsx
//
// Invoices & Payments (Phase 7). Lists real invoices (pet_invoices, migration
// 090), shows the branded printable invoice, records payments and voids unpaid
// invoices. The client only READS the tables; payments and voids go through the
// pet_* database functions. Overdue is derived from the due date, not stored.
//
// M-Pesa: "Send M-Pesa request" starts an STK push (migration 099); recording by M-Pesa
// code stays available as a fallback.
//
// Refunds (migration 105): a paid or part-paid invoice cannot be voided, so it is refunded instead.
// A refund needs the ADMIN PIN (checked by the database) and records money returned; it does not
// send any money. Each refund has its own printable refund receipt (RFD-...).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import {
  METHODS, METHOD_LABELS, STATUS_LABELS, STATUS_TONES, invoiceErrorMessage, outstanding, displayStatus, filterInvoices, summarize,
  refundable, netPaid, hasProductLines, validateRefund, newIdempotencyKey, REFUND_PIN_REFUSED,
} from "./invoiceData";
import InvoiceDocument from "./InvoiceDocument";
import ReceiptDocument from "./ReceiptDocument";
import RefundDocument from "./RefundDocument";
import { sortedPayments, latestPaymentId, receiptFor, sortedRefunds, refundReceiptFor } from "./receiptData";
import MpesaStkPush from "./MpesaStkPush";
import SendInvoiceModal from "./SendInvoiceModal";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

var PAGE = 50;

export default function InvoicesPage({ openInvoiceId, onDetailClosed, initialStatus }) {
  var salon = useSalon();
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var statusState = useState("loading"); var loadStatus = statusState[0]; var setLoadStatus = statusState[1];
  var tickState = useState(0); var tick = tickState[0]; var setTick = tickState[1];
  var fState = useState({ q: "", status: initialStatus || "all" }); var filters = fState[0]; var setFilters = fState[1];
  var shownState = useState(PAGE); var shown = shownState[0]; var setShown = shownState[1];
  var detailState = useState(openInvoiceId || null); var detailId = detailState[0]; var setDetailId = detailState[1];
  var payState = useState({ method: "cash", amount: "", reference: "" }); var pay = payState[0]; var setPay = payState[1];
  var voidState = useState(null); var voiding = voidState[0]; var setVoiding = voidState[1]; // {id, reason}
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var receiptState = useState(null); var receiptId = receiptState[0]; var setReceiptId = receiptState[1];
  var paidState = useState(false); var justPaid = paidState[0]; var setJustPaid = paidState[1];
  var refundState = useState(null); var refunding = refundState[0]; var setRefunding = refundState[1]; // {amount, method, reason, reference, restock, key}
  var refundReceiptState = useState(null); var refundReceiptId = refundReceiptState[0]; var setRefundReceiptId = refundReceiptState[1];
  var justRefundedState = useState(null); var justRefunded = justRefundedState[0]; var setJustRefunded = justRefundedState[1];
  // Admin-PIN step-up for refunds (the database checks the PIN; it is held only for the one call).
  var pinAskState = useState(false); var pinAsk = pinAskState[0]; var setPinAsk = pinAskState[1];
  var pinValState = useState(""); var pinVal = pinValState[0]; var setPinVal = pinValState[1];
  var pinErrState = useState(""); var pinErr = pinErrState[0]; var setPinErr = pinErrState[1];
  var pinResolver = useRef(null);
  var sendState = useState(null); var sendChannel = sendState[0]; var setSendChannel = sendState[1]; // "email" | "whatsapp" | null

  useEffect(function () { if (openInvoiceId) setDetailId(openInvoiceId); }, [openInvoiceId]);

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    Promise.all([
      db("GET", "pet_invoices", null, "?select=*,pet_invoice_lines(*),pet_payments(*),pet_refunds(*)&order=issued_at.desc&limit=500"),
      db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=2000"),
      db("GET", "pet_pets", null, "?select=id,name,species&limit=5000"),
      // Customer emails (for "Email invoice"). Optional: if this fails, sharing by email just opens a blank "To".
      db("GET", "pet_customer_profiles", null, "?select=customer_id,email&limit=2000"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- an error, not "no invoices".
      if (!res.slice(0, 3).every(Array.isArray)) { setLoadStatus("error"); return; }
      setData({ invoices: res[0], customers: res[1], pets: res[2], profiles: Array.isArray(res[3]) ? res[3] : [] }); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [tick]);

  var maps = useMemo(function () {
    var m = { customers: {}, pets: {}, emails: {} };
    if (data) {
      data.customers.forEach(function (c) { m.customers[c.id] = c; });
      data.pets.forEach(function (p) { m.pets[p.id] = p; });
      (data.profiles || []).forEach(function (r) { if (r && r.customer_id && r.email) m.emails[r.customer_id] = r.email; });
    }
    return m;
  }, [data]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Invoices & Payments" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading invoices…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Invoices & Payments" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load invoices" description="Check your connection and try again."
            action={<Button onClick={function () { setTick(tick + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  function names(inv) {
    var c = maps.customers[inv.customer_id]; var p = inv.pet_id ? maps.pets[inv.pet_id] : null;
    return { customer: c ? c.name : "Unknown customer", pet: p ? p.name : "" };
  }
  var all = data.invoices;
  var filtered = filterInvoices(all, filters, names);
  var totals = summarize(all);
  var detail = detailId ? all.filter(function (i) { return i.id === detailId; })[0] : null;
  function setF(k, v) { var o = {}; o[k] = v; setFilters(Object.assign({}, filters, o)); setShown(PAGE); }
  function closeDetail() { setSendChannel(null); if (!saving && !refunding && !pinAsk) { setDetailId(null); setReceiptId(null); setRefundReceiptId(null); setJustRefunded(null); setJustPaid(false); setErr(""); setPay({ method: "cash", amount: "", reference: "" }); if (onDetailClosed) onDetailClosed(); } }

  async function recordPayment() {
    if (saving || !detail) return;
    var amount = Number(pay.amount);
    if (!pay.amount || !isFinite(amount) || Math.floor(amount) !== amount || amount <= 0) { setErr("Enter a positive whole amount."); return; }
    if (amount > outstanding(detail)) { setErr("The payment is more than the amount still owed."); return; }
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_record_payment", { p_invoice_id: detail.id, p_method: pay.method, p_amount: amount, p_reference: pay.reference.trim() || null });
    setSaving(false);
    if (res.error) { setErr(invoiceErrorMessage(res.error)); return; }
    setPay({ method: "cash", amount: "", reference: "" });
    setJustPaid(true);
    setTick(tick + 1);
  }

  async function confirmVoid() {
    if (saving || !voiding) return;
    if (!voiding.reason.trim()) { setErr("Enter a reason for voiding this invoice."); return; }
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_void_invoice", { p_invoice_id: voiding.id, p_reason: voiding.reason.trim() });
    setSaving(false);
    if (res.error) { setErr(invoiceErrorMessage(res.error)); return; }
    setVoiding(null);
    setTick(tick + 1);
  }

  function askPin() {
    return new Promise(function (resolve) { pinResolver.current = resolve; setPinVal(""); setPinErr(""); setPinAsk(true); });
  }
  function answerPin(value) {
    var r = pinResolver.current; pinResolver.current = null;
    setPinAsk(false); setPinVal(""); setPinErr("");
    if (r) r(value);
  }
  function submitPin() {
    if (!/^[0-9]{4,6}$/.test(pinVal)) { setPinErr("Enter the admin PIN (4 to 6 digits)."); return; }
    answerPin(pinVal);
  }

  function openRefund() {
    if (!detail) return;
    setErr("");
    setRefunding({ amount: String(refundable(detail)), method: "cash", reason: "", reference: "", restock: false, key: newIdempotencyKey() });
  }

  async function confirmRefund() {
    if (saving || !refunding || !detail) return;
    var msg = validateRefund(detail, refunding);
    if (msg) { setErr(msg); return; }
    var amount = Number(refunding.amount);
    var completes = amount === refundable(detail);
    var restock = !!refunding.restock && completes && hasProductLines(detail);
    setErr("");
    var pin = await askPin();
    if (pin === null) return;
    setSaving(true);
    var res = await dbRpcAuth("pet_refund_invoice", {
      p_admin_pin: pin, p_idempotency_key: refunding.key, p_invoice_id: detail.id, p_method: refunding.method, p_amount: amount,
      p_reason: refunding.reason.trim(), p_reference: refunding.reference.trim() || null, p_return_stock: restock,
    });
    pin = null;
    setSaving(false);
    if (res.error) { setErr(invoiceErrorMessage(res.error)); return; }
    // The database answers null for a wrong or locked-out admin PIN: nothing was refunded.
    if (res.data === null || res.data === undefined || res.data === false) { setErr(REFUND_PIN_REFUSED); return; }
    setRefunding(null);
    setJustRefunded(res.data);
    setTick(tick + 1);
  }

  return (
    <div>
      <PageHeader title="Invoices & Payments" subtitle="Every invoice, what is owed, and payments received" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Card style={{ padding: 14 }}><div style={{ fontSize: 12, color: MUTED_FG }}>Outstanding</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(totals.outstanding)}</div></Card>
        <Card style={{ padding: 14 }}><div style={{ fontSize: 12, color: MUTED_FG }}>Overdue</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(totals.overdue)}</div>
          <div style={{ fontSize: 11, color: MUTED_FG }}>{totals.overdueCount} {totals.overdueCount === 1 ? "invoice" : "invoices"}</div></Card>
      </div>

      <Card style={{ padding: 12, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
        <input aria-label="Search invoices" placeholder="Search number, customer or pet" value={filters.q}
          onChange={function (e) { setF("q", e.target.value); }} style={Object.assign({}, inputStyle, { flex: "1 1 220px", width: "auto" })} />
        <select aria-label="Filter by status" value={filters.status} onChange={function (e) { setF("status", e.target.value); }} style={Object.assign({}, inputStyle, { width: 160 })}>
          <option value="all">All statuses</option>
          <option value="outstanding">Outstanding (unpaid or part paid)</option>
          {["issued", "partial", "paid", "overdue", "void", "refunded"].map(function (s) { return <option key={s} value={s}>{STATUS_LABELS[s]}</option>; })}
        </select>
      </Card>

      {all.length === 0 ? (
        <Card><EmptyState title="No invoices yet" description="Complete a sale in Checkout and its invoice will appear here." /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState title="No invoices found" description="Try a different search or status." /></Card>
      ) : (
        <div>
          {filtered.slice(0, shown).map(function (inv) {
            var n = names(inv); var st = displayStatus(inv);
            return (
              <Card key={inv.id} style={{ padding: 12, marginBottom: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 90, fontWeight: 800, fontSize: 13 }}>{inv.invoice_number}</div>
                <div style={{ flex: "1 1 180px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{n.customer}{n.pet ? <span style={{ color: MUTED_FG, fontWeight: 500 }}> · {n.pet}</span> : null}</div>
                  <div style={{ fontSize: 12, color: MUTED_FG }}>{new Date(inv.issued_at).toLocaleDateString()}{inv.due_date ? " · due " + inv.due_date : ""}</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 110 }}>
                  <div style={{ fontWeight: 700 }}>{fmt(inv.total)}</div>
                  {outstanding(inv) > 0 ? <div style={{ fontSize: 11, color: MUTED_FG }}>{fmt(outstanding(inv))} owed</div> : null}
                </div>
                <Badge tone={STATUS_TONES[st]}>{STATUS_LABELS[st]}</Badge>
                <Button size="sm" variant="outline" onClick={function () { setErr(""); setDetailId(inv.id); }} ariaLabel={"Open invoice " + inv.invoice_number}>Open</Button>
              </Card>
            );
          })}
          {filtered.length > shown ? <div style={{ textAlign: "center", marginTop: 8 }}><Button size="sm" variant="outline" onClick={function () { setShown(shown + PAGE); }}>Show more</Button></div> : null}
        </div>
      )}

      <Modal open={!!detail && !receiptId && !refundReceiptId} onClose={closeDetail} title={detail ? "Invoice " + detail.invoice_number : ""} width={720}
        footer={detail ? <>
          <Button variant="ghost" onClick={closeDetail}>Close</Button>
          {detail.status === "issued" ? <Button variant="ghost-danger" onClick={function () { setErr(""); setVoiding({ id: detail.id, reason: "" }); }}>Void invoice</Button> : null}
          {refundable(detail) > 0 ? <Button variant="ghost-danger" onClick={openRefund}>Refund</Button> : null}
          <Button variant="outline" onClick={function () { setSendChannel("email"); }}>Email</Button>
          <Button variant="outline" onClick={function () { setSendChannel("whatsapp"); }}>WhatsApp</Button>
          <Button onClick={function () { window.print(); }}>Print</Button>
        </> : null}>
        {detail ? (
          <div>
            <InvoiceDocument invoice={detail} customer={maps.customers[detail.customer_id]} pet={detail.pet_id ? maps.pets[detail.pet_id] : null} salon={salon} />
            {(detail.status === "issued" || detail.status === "partial") ? (
              <div style={{ marginTop: 14, padding: 12, border: "1px solid " + BORDER, borderRadius: 12, background: MUTED }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: FOREGROUND }}>Record a payment · {fmt(outstanding(detail))} owed</div>
                {pay.method === "mpesa" ? (
                  <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid " + BORDER }}>
                    <MpesaStkPush key={detail.id + ":" + outstanding(detail)} salonId={salon && salon.id} invoice={detail} owed={outstanding(detail)}
                      defaultPhone={(maps.customers[detail.customer_id] || {}).phone || ""} reference={detail.invoice_number}
                      onRecorded={function () { setTick(tick + 1); }} />
                    <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 8 }}>Or record a payment the customer already made, using its M-Pesa code:</div>
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 8 }}>
                  <Field label="Method" htmlFor="pay-method">
                    <select id="pay-method" style={inputStyle} value={pay.method} onChange={function (e) { setPay(Object.assign({}, pay, { method: e.target.value })); }}>
                      {METHODS.map(function (m) { return <option key={m} value={m}>{METHOD_LABELS[m]}</option>; })}
                    </select>
                  </Field>
                  <Field label="Amount (KES)" htmlFor="pay-amount"><input id="pay-amount" inputMode="numeric" style={inputStyle} value={pay.amount} onChange={function (e) { setPay(Object.assign({}, pay, { amount: e.target.value })); }} /></Field>
                  <Field label={pay.method === "mpesa" ? "M-Pesa code" : "Reference (optional)"} htmlFor="pay-ref"><input id="pay-ref" style={inputStyle} value={pay.reference} onChange={function (e) { setPay(Object.assign({}, pay, { reference: e.target.value })); }} /></Field>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <Button size="sm" onClick={recordPayment} disabled={saving}>{saving ? "Saving…" : "Record payment"}</Button>
                  <Button size="sm" variant="outline" onClick={function () { setPay(Object.assign({}, pay, { amount: String(outstanding(detail)) })); }}>Pay full balance</Button>
                </div>
              </div>
            ) : null}
            {justPaid && detail.pet_payments && detail.pet_payments.length ? (
              <div role="status" style={{ marginTop: 14, padding: 12, border: "1px solid " + BORDER, borderRadius: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, flex: "1 1 200px" }}>Payment recorded.</span>
                <Button size="sm" onClick={function () { setReceiptId(latestPaymentId(detail)); }}>Print receipt</Button>
              </div>
            ) : null}
            {detail.pet_payments && detail.pet_payments.length ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>Receipts</div>
                {sortedPayments(detail).map(function (p) {
                  var r = receiptFor(detail, p.id);
                  return (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}>
                      <span>{r.number} · {fmt(p.amount)}</span>
                      <Button size="sm" variant="outline" onClick={function () { setReceiptId(p.id); }} ariaLabel={"View receipt " + r.number}>Receipt</Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {justRefunded && refundReceiptFor(detail, justRefunded) ? (
              <div role="status" style={{ marginTop: 14, padding: 12, border: "1px solid " + BORDER, borderRadius: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, flex: "1 1 200px" }}>Refund recorded.</span>
                <Button size="sm" onClick={function () { setRefundReceiptId(justRefunded); }}>Print refund receipt</Button>
              </div>
            ) : null}
            {sortedRefunds(detail).length ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>Refunds · {fmt(detail.amount_refunded)} returned · {fmt(netPaid(detail))} kept</div>
                {sortedRefunds(detail).map(function (f) {
                  var r = refundReceiptFor(detail, f.id);
                  return (
                    <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}>
                      <span>{r.number} · {fmt(f.amount)} · {METHOD_LABELS[f.method] || f.method}</span>
                      <Button size="sm" variant="outline" onClick={function () { setRefundReceiptId(f.id); }} ariaLabel={"View refund receipt " + r.number}>Refund receipt</Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {!voiding && !refunding ? <ErrorLine>{err}</ErrorLine> : null}
          </div>
        ) : null}
      </Modal>

      {detail && sendChannel ? (
        <SendInvoiceModal key={detail.id + sendChannel} invoice={detail} customer={maps.customers[detail.customer_id]} pet={detail.pet_id ? maps.pets[detail.pet_id] : null}
          salon={salon} email={maps.emails[detail.customer_id] || ""} channel={sendChannel} onClose={function () { setSendChannel(null); }} />
      ) : null}

      <Modal open={!!detail && !!receiptId} onClose={function () { setReceiptId(null); }} title={detail && receiptId && receiptFor(detail, receiptId) ? "Receipt " + receiptFor(detail, receiptId).number : "Receipt"} width={560}
        footer={<>
          <Button variant="ghost" onClick={function () { setReceiptId(null); }}>Back to invoice</Button>
          <Button onClick={function () { window.print(); }}>Print</Button>
        </>}>
        {detail && receiptId ? (
          <ReceiptDocument invoice={detail} paymentId={receiptId} customer={maps.customers[detail.customer_id]} pet={detail.pet_id ? maps.pets[detail.pet_id] : null} salon={salon} />
        ) : null}
      </Modal>

      <Modal open={!!voiding} onClose={function () { if (!saving) { setVoiding(null); setErr(""); } }} title="Void this invoice?"
        footer={<>
          <Button variant="ghost" onClick={function () { setVoiding(null); setErr(""); }} disabled={saving}>Keep invoice</Button>
          <Button variant="danger" onClick={confirmVoid} disabled={saving}>{saving ? "Voiding…" : "Void invoice"}</Button>
        </>}>
        <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.5, color: FOREGROUND }}>
          The invoice stays on record as void and keeps its number. This can't be undone. Only invoices with no payments can be voided.
        </p>
        <Field label="Reason" htmlFor="void-reason">
          <input id="void-reason" style={inputStyle} value={voiding ? voiding.reason : ""} onChange={function (e) { setVoiding(Object.assign({}, voiding, { reason: e.target.value })); }} />
        </Field>
        <ErrorLine>{err}</ErrorLine>
      </Modal>
      <Modal open={!!detail && !!refundReceiptId} onClose={function () { setRefundReceiptId(null); }} title={detail && refundReceiptId && refundReceiptFor(detail, refundReceiptId) ? "Refund receipt " + refundReceiptFor(detail, refundReceiptId).number : "Refund receipt"} width={560}
        footer={<>
          <Button variant="ghost" onClick={function () { setRefundReceiptId(null); }}>Back to invoice</Button>
          <Button onClick={function () { window.print(); }}>Print</Button>
        </>}>
        {detail && refundReceiptId ? (
          <RefundDocument invoice={detail} refundId={refundReceiptId} customer={maps.customers[detail.customer_id]} pet={detail.pet_id ? maps.pets[detail.pet_id] : null} salon={salon} />
        ) : null}
      </Modal>

      <Modal open={!!refunding} onClose={function () { if (!saving && !pinAsk) { setRefunding(null); setErr(""); } }} title={detail ? "Refund " + detail.invoice_number : "Refund"}
        footer={<>
          <Button variant="ghost" onClick={function () { setRefunding(null); setErr(""); }} disabled={saving}>Cancel</Button>
          <Button variant="danger" onClick={confirmRefund} disabled={saving}>{saving ? "Refunding…" : "Refund…"}</Button>
        </>}>
        {detail && refunding ? (
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.5, color: FOREGROUND }}>
              {fmt(refundable(detail))} can still be refunded on this invoice. This records money you have returned to the customer. It does not send any money:
              pay an M-Pesa or card refund in that system, then record it here. The admin PIN is asked next.
              {detail.status === "partial" ? " This invoice is only part paid, so it can only be refunded in full." : ""}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Amount (KES)" htmlFor="refund-amount">
                <input id="refund-amount" inputMode="numeric" style={inputStyle} value={refunding.amount} disabled={detail.status === "partial"}
                  onChange={function (e) { setRefunding(Object.assign({}, refunding, { amount: e.target.value })); }} />
              </Field>
              <Field label="Returned by" htmlFor="refund-method">
                <select id="refund-method" style={inputStyle} value={refunding.method} onChange={function (e) { setRefunding(Object.assign({}, refunding, { method: e.target.value })); }}>
                  {METHODS.map(function (m) { return <option key={m} value={m}>{METHOD_LABELS[m]}</option>; })}
                </select>
              </Field>
            </div>
            <Field label="Reason" htmlFor="refund-reason">
              <input id="refund-reason" style={inputStyle} value={refunding.reason} onChange={function (e) { setRefunding(Object.assign({}, refunding, { reason: e.target.value })); }} />
            </Field>
            <Field label={refunding.method === "mpesa" ? "M-Pesa reference (optional)" : "Reference (optional)"} htmlFor="refund-ref">
              <input id="refund-ref" style={inputStyle} value={refunding.reference} onChange={function (e) { setRefunding(Object.assign({}, refunding, { reference: e.target.value })); }} />
            </Field>
            {hasProductLines(detail) && Number(refunding.amount) === refundable(detail) ? (
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 4 }}>
                <input type="checkbox" checked={!!refunding.restock} onChange={function (e) { setRefunding(Object.assign({}, refunding, { restock: e.target.checked })); }} />
                Put the products on this invoice back into stock
              </label>
            ) : null}
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={pinAsk} onClose={function () { answerPin(null); }} title="Confirm with admin PIN"
        description="Enter the admin PIN to record this refund."
        footer={<>
          <Button variant="ghost" onClick={function () { answerPin(null); }}>Cancel</Button>
          <Button onClick={submitPin}>Confirm</Button>
        </>}>
        <Field label="Admin PIN" htmlFor="refund-admin-pin">
          <input id="refund-admin-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} style={inputStyle} value={pinVal}
            onChange={function (e) { setPinVal(e.target.value.replace(/[^0-9]/g, "")); setPinErr(""); }}
            onKeyDown={function (e) { if (e.key === "Enter") submitPin(); }} autoFocus />
        </Field>
        <ErrorLine>{pinErr}</ErrorLine>
      </Modal>
    </div>
  );
}
