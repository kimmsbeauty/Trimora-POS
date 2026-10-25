// src/pages/pet/InvoicesPage.jsx
//
// Invoices & Payments (Phase 7). Lists real invoices (pet_invoices, migration
// 090), shows the branded printable invoice, records payments and voids unpaid
// invoices. The client only READS the tables; payments and voids go through the
// pet_* database functions. Overdue is derived from the due date, not stored.
//
// M-Pesa: "Send M-Pesa request" starts an STK push (migration 099); recording by M-Pesa
// code stays available as a fallback. Not built yet: refunds (so a paid invoice cannot be voided).
import React, { useEffect, useMemo, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import {
  METHODS, METHOD_LABELS, STATUS_LABELS, STATUS_TONES, invoiceErrorMessage, outstanding, displayStatus, filterInvoices, summarize,
} from "./invoiceData";
import InvoiceDocument from "./InvoiceDocument";
import MpesaStkPush from "./MpesaStkPush";
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

  useEffect(function () { if (openInvoiceId) setDetailId(openInvoiceId); }, [openInvoiceId]);

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    Promise.all([
      db("GET", "pet_invoices", null, "?select=*,pet_invoice_lines(*),pet_payments(*)&order=issued_at.desc&limit=500"),
      db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=2000"),
      db("GET", "pet_pets", null, "?select=id,name,species&limit=5000"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- an error, not "no invoices".
      if (!res.every(Array.isArray)) { setLoadStatus("error"); return; }
      setData({ invoices: res[0], customers: res[1], pets: res[2] }); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [tick]);

  var maps = useMemo(function () {
    var m = { customers: {}, pets: {} };
    if (data) { data.customers.forEach(function (c) { m.customers[c.id] = c; }); data.pets.forEach(function (p) { m.pets[p.id] = p; }); }
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
  function closeDetail() { if (!saving) { setDetailId(null); setErr(""); setPay({ method: "cash", amount: "", reference: "" }); if (onDetailClosed) onDetailClosed(); } }

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
          {["issued", "partial", "paid", "overdue", "void"].map(function (s) { return <option key={s} value={s}>{STATUS_LABELS[s]}</option>; })}
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

      <Modal open={!!detail} onClose={closeDetail} title={detail ? "Invoice " + detail.invoice_number : ""} width={720}
        footer={detail ? <>
          <Button variant="ghost" onClick={closeDetail}>Close</Button>
          {detail.status === "issued" ? <Button variant="ghost-danger" onClick={function () { setErr(""); setVoiding({ id: detail.id, reason: "" }); }}>Void invoice</Button> : null}
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
            {!voiding ? <ErrorLine>{err}</ErrorLine> : null}
          </div>
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
    </div>
  );
}
