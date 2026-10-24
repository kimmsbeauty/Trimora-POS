// src/pages/pet/CheckoutPage.jsx
//
// Checkout (Phase 7): turn a visit or a walk-in sale into an invoice, take
// payment, and open the branded invoice. The whole sale is sent to ONE database
// function (pet_create_invoice) that works out totals from the catalogue, numbers
// the invoice, and records the payments atomically. The totals shown here are a
// preview only. A per-sale key makes a double click or retry return the same
// invoice instead of a second one.
//
// Not built yet: product lines (arrive with Supplies), M-Pesa STK push, refunds,
// loyalty points.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import {
  METHODS, METHOD_LABELS, computeTotals, validateCheckout, paymentRows, paymentsSum, invoiceErrorMessage, newIdempotencyKey,
} from "./invoiceData";
import { PageHeader, Card, Button, Field, ErrorLine, EmptyState, inputStyle } from "./ui";

function blankDraft() {
  return { customer_id: "", pet_id: "", booking_id: "", lines: [{ service_id: "", quantity: "1" }], discountType: "amount", discountValue: "",
    due_date: "", notes: "", payments: [] };
}

export default function CheckoutPage({ onInvoiceCreated }) {
  var salon = useSalon();
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var statusState = useState("loading"); var loadStatus = statusState[0]; var setLoadStatus = statusState[1];
  var tickState = useState(0); var tick = tickState[0]; var setTick = tickState[1];
  var draftState = useState(blankDraft); var draft = draftState[0]; var setDraft = draftState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var noteState = useState(""); var note = noteState[0]; var setNote = noteState[1];
  var keyRef = useRef(newIdempotencyKey());

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    Promise.all([
      db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=2000"),
      db("GET", "pet_pets", null, "?select=id,customer_id,name,species&order=name.asc&limit=5000"),
      db("GET", "pet_services", null, "?select=id,name,category,price,active&active=eq.true&order=name.asc&limit=1000"),
      db("GET", "pet_bookings", null, "?select=id,customer_id,pet_id,starts_at,status,pet_booking_services(service_id,service_name)&status=in.(checked-in,in-progress,completed)&order=starts_at.desc&limit=300"),
      db("GET", "pet_invoices", null, "?select=booking_id&booking_id=not.is.null&status=neq.void&limit=2000"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- an error, not "nothing to show".
      if (!res.every(Array.isArray)) { setLoadStatus("error"); return; }
      var invoiced = {}; res[4].forEach(function (i) { invoiced[i.booking_id] = true; });
      setData({ customers: res[0], pets: res[1], services: res[2], bookings: res[3].filter(function (b) { return !invoiced[b.id]; }) });
      setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [tick]);

  var serviceById = useMemo(function () {
    var m = {}; if (data) data.services.forEach(function (s) { m[s.id] = s; }); return m;
  }, [data]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Checkout" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading checkout…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Checkout" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load checkout" description="Check your connection and try again."
            action={<Button onClick={function () { setTick(tick + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var petsOfCustomer = data.pets.filter(function (p) { return p.customer_id === draft.customer_id; });
  var bookingsOfCustomer = data.bookings.filter(function (b) { return b.customer_id === draft.customer_id; });
  var priced = draft.lines.map(function (l) {
    var s = serviceById[l.service_id];
    return { unit_price: s ? s.price : 0, quantity: Number(l.quantity) || 0 };
  });
  var totals = computeTotals({ lines: priced, discountType: draft.discountType, discountValue: draft.discountValue,
    taxEnabled: !!(salon && salon.tax_enabled), taxRate: salon && salon.tax_rate });
  var paid = paymentsSum(draft.payments);
  var balance = totals.total - paid;

  function patch(p) { setDraft(Object.assign({}, draft, p)); setErr(""); }
  function setLine(i, p) { patch({ lines: draft.lines.map(function (l, idx) { return idx === i ? Object.assign({}, l, p) : l; }) }); }
  function setPayment(i, p) { patch({ payments: draft.payments.map(function (x, idx) { return idx === i ? Object.assign({}, x, p) : x; }) }); }

  function chooseBooking(id) {
    var b = data.bookings.filter(function (x) { return x.id === id; })[0];
    if (!b) { patch({ booking_id: "" }); setNote(""); return; }
    var lines = (b.pet_booking_services || []).filter(function (l) { return serviceById[l.service_id]; })
      .map(function (l) { return { service_id: l.service_id, quantity: "1" }; });
    var missing = (b.pet_booking_services || []).length - lines.length;
    setNote(missing > 0 ? missing + " service(s) on this booking are no longer in the active catalogue and were not added. Prices come from the current catalogue." : "Prices come from the current catalogue.");
    patch({ booking_id: id, pet_id: b.pet_id, lines: lines.length ? lines : [{ service_id: "", quantity: "1" }] });
  }

  async function completeSale() {
    if (saving) return;
    var cleanLines = draft.lines.filter(function (l) { return l.service_id; });
    var msg = validateCheckout(Object.assign({}, draft, { lines: cleanLines }), totals);
    if (msg) { setErr(msg); return; }
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_create_invoice", {
      p_idempotency_key: keyRef.current, p_customer_id: draft.customer_id, p_pet_id: draft.pet_id || null, p_booking_id: draft.booking_id || null,
      p_lines: cleanLines.map(function (l) { return { service_id: l.service_id, quantity: Number(l.quantity) }; }),
      p_discount_type: draft.discountType, p_discount_value: Number(draft.discountValue) || 0,
      p_due_date: draft.due_date || null, p_notes: draft.notes || null, p_payments: paymentRows(draft.payments),
    });
    setSaving(false);
    if (res.error) { setErr(invoiceErrorMessage(res.error)); return; }
    // Fresh key for the next sale; the form resets and the invoice opens.
    keyRef.current = newIdempotencyKey();
    setDraft(blankDraft()); setNote("");
    if (onInvoiceCreated) onInvoiceCreated(res.data);
  }

  var serviceOptions = data.services;
  return (
    <div>
      <PageHeader title="Checkout" subtitle="Create an invoice for a visit or a walk-in sale and take payment" />
      {serviceOptions.length === 0 ? (
        <Card><EmptyState title="No services to sell" description="Add services in the Grooming tab (including boarding rates) before using checkout." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 16 }}>
            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>1. Customer and visit</div>
              <Field label="Customer" htmlFor="co-customer">
                <select id="co-customer" style={inputStyle} value={draft.customer_id}
                  onChange={function (e) { patch({ customer_id: e.target.value, pet_id: "", booking_id: "" }); setNote(""); }}>
                  <option value="">Choose a customer</option>
                  {data.customers.map(function (c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                </select>
              </Field>
              <Field label="Booking (optional)" htmlFor="co-booking">
                <select id="co-booking" style={inputStyle} value={draft.booking_id} disabled={!draft.customer_id} onChange={function (e) { chooseBooking(e.target.value); }}>
                  <option value="">{draft.customer_id ? "No booking (walk-in sale)" : "Choose a customer first"}</option>
                  {bookingsOfCustomer.map(function (b) {
                    var p = data.pets.filter(function (x) { return x.id === b.pet_id; })[0];
                    return <option key={b.id} value={b.id}>{new Date(b.starts_at).toLocaleDateString()} · {p ? p.name : "Pet"} · {b.status}</option>;
                  })}
                </select>
              </Field>
              <Field label="Pet (optional)" htmlFor="co-pet">
                <select id="co-pet" style={inputStyle} value={draft.pet_id} disabled={!draft.customer_id || !!draft.booking_id} onChange={function (e) { patch({ pet_id: e.target.value }); }}>
                  <option value="">No pet</option>
                  {petsOfCustomer.map(function (p) { return <option key={p.id} value={p.id}>{p.name} ({p.species})</option>; })}
                </select>
              </Field>
              {note ? <p role="status" style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>{note}</p> : null}
            </Card>

            <Card style={{ padding: 16, display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>2. Services</div>
              {draft.lines.map(function (l, i) {
                var s = serviceById[l.service_id];
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px auto", gap: 8, alignItems: "end" }}>
                    <Field label={i === 0 ? "Service" : ""} htmlFor={"co-svc-" + i}>
                      <select id={"co-svc-" + i} aria-label={"Service " + (i + 1)} style={inputStyle} value={l.service_id} onChange={function (e) { setLine(i, { service_id: e.target.value }); }}>
                        <option value="">Choose a service</option>
                        {serviceOptions.map(function (x) { return <option key={x.id} value={x.id}>{x.name} · {x.category} · {fmt(x.price)}</option>; })}
                      </select>
                    </Field>
                    <Field label={i === 0 ? "Qty" : ""} htmlFor={"co-qty-" + i}>
                      <input id={"co-qty-" + i} aria-label={"Quantity " + (i + 1)} inputMode="numeric" style={inputStyle} value={l.quantity} onChange={function (e) { setLine(i, { quantity: e.target.value }); }} />
                    </Field>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6 }}>
                      <span style={{ fontSize: 12, color: MUTED_FG, minWidth: 70, textAlign: "right" }}>{s ? fmt(s.price * (Number(l.quantity) || 0)) : ""}</span>
                      {draft.lines.length > 1 ? <Button size="sm" variant="ghost" ariaLabel={"Remove item " + (i + 1)} onClick={function () { patch({ lines: draft.lines.filter(function (_, idx) { return idx !== i; }) }); }}>✕</Button> : null}
                    </div>
                  </div>
                );
              })}
              <div><Button size="sm" variant="outline" onClick={function () { patch({ lines: draft.lines.concat([{ service_id: "", quantity: "1" }]) }); }}>+ Add item</Button></div>
            </Card>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <Card style={{ padding: 16, display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>3. Discount and details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Discount type" htmlFor="co-dtype">
                  <select id="co-dtype" style={inputStyle} value={draft.discountType} onChange={function (e) { patch({ discountType: e.target.value }); }}>
                    <option value="amount">Amount (KES)</option><option value="percent">Percent (%)</option>
                  </select>
                </Field>
                <Field label="Discount" htmlFor="co-discount"><input id="co-discount" inputMode="decimal" style={inputStyle} value={draft.discountValue} onChange={function (e) { patch({ discountValue: e.target.value }); }} /></Field>
              </div>
              <Field label="Due date (optional)" htmlFor="co-due"><input id="co-due" type="date" style={inputStyle} value={draft.due_date} onChange={function (e) { patch({ due_date: e.target.value }); }} /></Field>
              <Field label="Notes (optional)" htmlFor="co-notes"><textarea id="co-notes" rows={2} style={inputStyle} value={draft.notes} onChange={function (e) { patch({ notes: e.target.value }); }} /></Field>
            </Card>

            <Card style={{ padding: 16, display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>4. Payment</div>
              {draft.payments.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>No payment yet. The invoice will be issued as unpaid, and you can record payments later.</p> : null}
              {draft.payments.map(function (p, i) {
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr auto", gap: 6, alignItems: "end" }}>
                    <select aria-label={"Payment method " + (i + 1)} style={inputStyle} value={p.method} onChange={function (e) { setPayment(i, { method: e.target.value }); }}>
                      {METHODS.map(function (m) { return <option key={m} value={m}>{METHOD_LABELS[m]}</option>; })}
                    </select>
                    <input aria-label={"Payment amount " + (i + 1)} placeholder="Amount" inputMode="numeric" style={inputStyle} value={p.amount} onChange={function (e) { setPayment(i, { amount: e.target.value }); }} />
                    <input aria-label={"Payment reference " + (i + 1)} placeholder={p.method === "mpesa" ? "M-Pesa code" : "Reference"} style={inputStyle} value={p.reference} onChange={function (e) { setPayment(i, { reference: e.target.value }); }} />
                    <Button size="sm" variant="ghost" ariaLabel={"Remove payment " + (i + 1)} onClick={function () { patch({ payments: draft.payments.filter(function (_, idx) { return idx !== i; }) }); }}>✕</Button>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" variant="outline" onClick={function () { patch({ payments: draft.payments.concat([{ method: draft.payments.length ? "mpesa" : "cash", amount: balance > 0 ? String(balance) : "", reference: "" }]) }); }}>+ Add payment</Button>
              </div>
            </Card>

            <Card style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ color: MUTED_FG }}>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
              {totals.discount > 0 ? <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ color: MUTED_FG }}>Discount</span><span>- {fmt(totals.discount)}</span></div> : null}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, padding: "6px 0", borderTop: "1px solid " + BORDER, marginTop: 4 }}><span>Total</span><span>{fmt(totals.total)}</span></div>
              {salon && salon.tax_enabled ? <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED_FG }}><span>Includes VAT ({salon.tax_rate}%)</span><span>{fmt(totals.taxAmount)}</span></div> : null}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ color: MUTED_FG }}>Paid now</span><span>{fmt(paid)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, padding: "3px 0", color: FOREGROUND, background: MUTED, borderRadius: 8 }}><span>&nbsp;Balance</span><span>{fmt(Math.max(0, balance))}&nbsp;</span></div>
              <ErrorLine>{err}</ErrorLine>
              <div style={{ marginTop: 12 }}><Button onClick={completeSale} disabled={saving}>{saving ? "Completing…" : "Complete sale"}</Button></div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
