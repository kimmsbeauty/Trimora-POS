// src/pages/pet/ReportsPage.jsx
//
// Reports (Phase 8, admin-only navigation). READ-ONLY: it queries existing Pet tables
// and calculates in the browser (same approach as Auto's reports). There is no
// reporting migration and nothing here writes data.
//
// Admin-only is a UI convenience, not security: the shared device session means the
// database cannot yet tell staff from admin, so these figures are not protected
// from a signed-in staff device.
//
// Big periods are fetched in pages of 1000 rows (the server's response cap), up to
// 10 pages per dataset. If a dataset is still larger the screen says the figures are
// incomplete instead of showing a total that looks right but is not.
//
// Not built yet: CSV export, stock and loyalty figures (those modules come later),
// per-groomer revenue (invoices are not linked to a groomer).
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { db } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND, PRIMARY } from "./theme";
import { STATUS_LABELS as BOOKING_LABELS } from "./bookingData";
import { STATUS_LABELS as INVOICE_LABELS, displayStatus, outstanding } from "./invoiceData";
import { formatDay } from "./boardingData";
import {
  PRESETS, periodBounds, validateCustomRange, collectedTotal, refundedTotal, netCollected, revenueByDay, collectedByMethod, invoiceTotals, openInvoiceSummary,
  topServices, bookingStats, boardingStats, hasAnyData,
} from "./reportData";
import { PageHeader, Card, Button, Field, Badge, ErrorLine, EmptyState, inputStyle } from "./ui";

var PAGE_SIZE = 1000;
var MAX_PAGES = 10;

// Reads every page of a query. Returns {rows, truncated}, or null if any request failed.
async function fetchPaged(table, query) {
  var rows = [];
  for (var page = 0; page < MAX_PAGES; page++) {
    var res = await db("GET", table, null, query + "&limit=" + PAGE_SIZE + "&offset=" + page * PAGE_SIZE);
    if (!Array.isArray(res)) return null;
    rows = rows.concat(res);
    if (res.length < PAGE_SIZE) return { rows: rows, truncated: false };
  }
  return { rows: rows, truncated: true };
}

async function loadReport(b) {
  var range = function (col) { return "&" + col + "=gte." + b.fromIso + "&" + col + "=lt." + b.toIso; };
  var parts = await Promise.all([
    fetchPaged("pet_payments", "?select=id,invoice_id,method,amount,paid_at" + range("paid_at") + "&order=paid_at.asc,id.asc"),
    fetchPaged("pet_invoices", "?select=id,customer_id,status,total,discount_amount,tax_amount,amount_paid,issued_at" + range("issued_at") + "&order=issued_at.asc,id.asc"),
    fetchPaged("pet_invoices", "?select=id,invoice_number,customer_id,status,total,amount_paid,due_date,issued_at&status=in.(issued,partial)&order=due_date.asc.nullslast,id.asc"),
    fetchPaged("pet_invoice_lines", "?select=id,invoice_id,service_id,description,quantity,line_total" + range("created_at") + "&order=created_at.asc,id.asc"),
    fetchPaged("pet_bookings", "?select=id,staff_id,status,starts_at" + range("starts_at") + "&order=starts_at.asc,id.asc"),
    fetchPaged("pet_boarding_stays", "?select=id,kennel_id,status,check_in_on,check_out_on&check_in_on=lt." + b.toKey + "&check_out_on=gte." + b.fromKey + "&order=check_in_on.asc,id.asc"),
    fetchPaged("pet_kennels", "?select=id&order=id.asc"),
    fetchPaged("customers", "?select=id,name&order=id.asc"),
    fetchPaged("staff", "?select=id,name&order=id.asc"),
    // Refunds (migration 105). If this one read fails the report still opens, but says so, because
    // Collected would then be gross of refunds.
    fetchPaged("pet_refunds", "?select=id,invoice_id,method,amount,refunded_at" + range("refunded_at") + "&order=refunded_at.asc,id.asc"),
  ]);
  var refundsPart = parts.pop();
  for (var i = 0; i < parts.length; i++) if (!parts[i]) return null;
  var names = function (rows) { var m = {}; rows.forEach(function (r) { m[r.id] = r.name; }); return m; };
  return {
    payments: parts[0].rows, invoices: parts[1].rows, open: parts[2].rows, lines: parts[3].rows, bookings: parts[4].rows,
    stays: parts[5].rows, kennels: parts[6].rows, customerNames: names(parts[7].rows), staffNames: names(parts[8].rows),
    refunds: refundsPart ? refundsPart.rows : [], refundsFailed: !refundsPart,
    truncated: parts.some(function (p) { return p.truncated; }) || !!(refundsPart && refundsPart.truncated),
  };
}

function Stat(props) {
  return (
    <Card style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED_FG, textTransform: "uppercase", letterSpacing: 0.4 }}>{props.label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{props.value}</div>
      <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 2 }}>{props.sub}</div>
    </Card>
  );
}

function BarRow(props) {
  var pct = props.max > 0 ? Math.max(2, Math.round((props.value / props.max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.label}</span>
        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{props.valueText}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: MUTED, marginTop: 4 }}>
        <div style={{ width: props.value > 0 ? pct + "%" : 0, height: 6, borderRadius: 4, background: PRIMARY }} />
      </div>
      {props.sub ? <div style={{ fontSize: 11, color: MUTED_FG, marginTop: 2 }}>{props.sub}</div> : null}
    </div>
  );
}

function Section(props) {
  return (
    <Card style={{ padding: 16 }}>
      <h2 style={{ fontSize: 14, margin: "0 0 12px", color: FOREGROUND }}>{props.title}</h2>
      {props.children}
    </Card>
  );
}

export default function ReportsPage() {
  var presetState = useState("7d"); var preset = presetState[0]; var setPreset = presetState[1];
  var customState = useState({ from: "", to: "" }); var custom = customState[0]; var setCustom = customState[1];
  var appliedState = useState(null); var applied = appliedState[0]; var setApplied = appliedState[1]; // validated custom range
  var customErrState = useState(""); var customErr = customErrState[0]; var setCustomErr = customErrState[1];
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var boundsState = useState(null); var bounds = boundsState[0]; var setBounds = boundsState[1];
  var statusState = useState("loading"); var status = statusState[0]; var setStatus = statusState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];

  useEffect(function () {
    if (preset === "custom" && !applied) { setStatus("idle"); return undefined; }
    var cancelled = false;
    var b = periodBounds(preset, new Date(), applied);
    setStatus("loading");
    loadReport(b).then(function (d) {
      if (cancelled) return; // a newer period was chosen while this one loaded
      if (!d) { setStatus("error"); return; }
      setBounds(b); setData(d); setStatus("ready");
    });
    return function () { cancelled = true; };
  }, [preset, applied, attempt]);

  function choose(key) { setCustomErr(""); setPreset(key); if (key !== "custom") setApplied(null); }
  function applyCustom() {
    var msg = validateCustomRange(custom.from, custom.to);
    if (msg) { setCustomErr(msg); return; }
    setCustomErr(""); setApplied({ from: custom.from, to: custom.to });
  }

  var header = (
    <div>
      <PageHeader title="Reports" subtitle="How the business is doing. Figures are calculated from your invoices, payments, bookings and stays." />
      <Card style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {PRESETS.map(function (p) {
            return <Button key={p[0]} size="sm" variant={preset === p[0] ? undefined : "outline"} onClick={function () { choose(p[0]); }} ariaLabel={"Period: " + p[1]}>{p[1]}</Button>;
          })}
        </div>
        {preset === "custom" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginTop: 12 }}>
            <Field label="From" htmlFor="rep-from"><input id="rep-from" type="date" style={inputStyle} value={custom.from} onChange={function (e) { setCustom({ from: e.target.value, to: custom.to }); }} /></Field>
            <Field label="To" htmlFor="rep-to"><input id="rep-to" type="date" style={inputStyle} value={custom.to} min={custom.from} onChange={function (e) { setCustom({ from: custom.from, to: e.target.value }); }} /></Field>
            <Button onClick={applyCustom}>Show report</Button>
          </div>
        ) : null}
        <ErrorLine>{customErr}</ErrorLine>
      </Card>
    </div>
  );

  if (status === "idle") return <div>{header}<Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Choose a start and end date, then press Show report.</Card></div>;
  if (status === "error") {
    return (
      <div>{header}
        <Card style={{ padding: 8 }}><EmptyState title="Couldn't load the report" description="Check your connection and try again."
          action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} /></Card>
      </div>
    );
  }
  if (status === "loading" && !data) return <div>{header}<Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading report…</Card></div>;

  var now = new Date();
  var days = revenueByDay(data.payments, bounds.fromKey, bounds.toKey);
  var collected = collectedTotal(data.payments);
  var refunded = refundedTotal(data.refunds);
  var net = netCollected(data.payments, data.refunds);
  var methods = collectedByMethod(data.payments);
  var inv = invoiceTotals(data.invoices);
  var open = openInvoiceSummary(data.open, now);
  var invoicesById = {}; data.invoices.forEach(function (i) { invoicesById[i.id] = i; });
  var services = topServices(data.lines, invoicesById, 8);
  var bk = bookingStats(data.bookings, data.staffNames);
  var bd = boardingStats(data.stays, data.kennels, bounds.fromKey, bounds.toKey);
  var maxMethod = Math.max.apply(null, methods.map(function (m) { return m.total; }).concat([0]));
  var maxService = services.length ? services[0].revenue : 0;
  var maxStaff = bk.byStaff.length ? bk.byStaff[0].count : 0;
  var periodText = bounds.days === 1 ? formatDay(bounds.fromKey) : formatDay(bounds.fromKey) + " to " + formatDay(addDayBack(bounds.toKey));
  var empty = !hasAnyData(data) && open.count === 0;

  return (
    <div style={{ opacity: status === "loading" ? 0.6 : 1 }}>
      {header}
      <div style={{ fontSize: 12, color: MUTED_FG, margin: "-4px 0 12px" }}>Showing {periodText}{status === "loading" ? " · updating…" : ""}</div>

      {data.truncated ? (
        <Card style={{ padding: "10px 14px", marginBottom: 12, background: MUTED }}>
          <Badge tone="warning">Incomplete</Badge>{" "}
          <span style={{ fontSize: 12, color: MUTED_FG }}>This period has more records than can be loaded at once, so the figures below are incomplete. Choose a shorter period.</span>
        </Card>
      ) : null}

      {empty ? (
        <Card><EmptyState title="Nothing to report for this period" description="No payments, invoices, bookings or boarding stays were recorded in the chosen dates. Try a longer period." /></Card>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
            <Stat label="Collected" value={fmt(collected)} sub={data.payments.length + (data.payments.length === 1 ? " payment" : " payments") + " received"} />
            <Stat label="Refunded" value={fmt(refunded)} sub={data.refundsFailed ? "Couldn't load refunds, so Collected may be too high" : (data.refunds.length + (data.refunds.length === 1 ? " refund" : " refunds") + " · net collected " + fmt(net))} />
            <Stat label="Invoiced" value={fmt(inv.invoiced)} sub={inv.count + (inv.count === 1 ? " invoice" : " invoices") + (inv.count ? " · avg " + fmt(inv.average) : "")} />
            <Stat label="Still owed (all open invoices)" value={fmt(open.owed)} sub={open.overdueCount > 0 ? fmt(open.overdueOwed) + " overdue (" + open.overdueCount + ")" : open.count + " open"} />
            <Stat label="Bookings" value={String(bk.total)} sub={bk.total ? bk.lost + " cancelled or no-show (" + bk.lostRate + "%)" : "none in period"} />
            <Stat label="Boarding occupancy" value={bd.occupancyPct + "%"} sub={bd.kennelDays + " of " + bd.capacity + " kennel-days"} />
          </div>

          <Section title="Money collected by day">
            {collected === 0 ? <p style={{ margin: 0, color: MUTED_FG, fontSize: 13 }}>No payments were received in this period.</p> : (
              <div role="img" aria-label={"Bar chart of money collected per day, total " + fmt(collected)} style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: MUTED_FG, fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: MUTED_FG, fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip formatter={function (v) { return [fmt(v), "Collected"]; }} />
                    <Bar dataKey="total" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, margin: "16px 0" }}>
            <Section title="Collected by payment method">
              {methods.map(function (m) { return <BarRow key={m.method} label={m.label} value={m.total} max={maxMethod} valueText={fmt(m.total) + (collected > 0 ? " · " + m.share + "%" : "")} sub={m.count + (m.count === 1 ? " payment" : " payments")} />; })}
            </Section>
            <Section title="Top services by revenue">
              {services.length === 0 ? <p style={{ margin: 0, color: MUTED_FG, fontSize: 13 }}>No invoiced services in this period.</p> :
                services.map(function (s) { return <BarRow key={s.key} label={s.name} value={s.revenue} max={maxService} valueText={fmt(s.revenue)} sub={s.quantity + " sold"} />; })}
            </Section>
            <Section title="Bookings by status">
              {bk.total === 0 ? <p style={{ margin: 0, color: MUTED_FG, fontSize: 13 }}>No bookings in this period.</p> : (
                <div>
                  {Object.keys(bk.byStatus).filter(function (s) { return bk.byStatus[s] > 0; }).map(function (s) {
                    return <div key={s} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span>{BOOKING_LABELS[s] || s}</span><strong>{bk.byStatus[s]}</strong></div>;
                  })}
                  {bk.byStaff.length > 0 ? <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + BORDER }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>APPOINTMENTS PER STAFF MEMBER</div>
                    {bk.byStaff.map(function (s) { return <BarRow key={s.name} label={s.name} value={s.count} max={maxStaff} valueText={String(s.count)} />; })}
                  </div> : null}
                </div>
              )}
            </Section>
          </div>

          <Section title={"Open invoices (" + open.count + ")"}>
            {open.count === 0 ? <p style={{ margin: 0, color: MUTED_FG, fontSize: 13 }}>Nothing is owed. Every invoice is paid.</p> : (
              <div>
                {open.list.slice(0, 10).map(function (i) {
                  var st = displayStatus(i, now);
                  return (
                    <div key={i.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid " + BORDER }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{i.invoice_number} <span style={{ fontWeight: 400, color: MUTED_FG }}>· {data.customerNames[i.customer_id] || "Unknown customer"}</span></div>
                        <div style={{ fontSize: 12, color: MUTED_FG }}>{i.due_date ? "Due " + formatDay(i.due_date) : "No due date"}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Badge tone={st === "overdue" ? "danger" : st === "partial" ? "info" : "warning"}>{INVOICE_LABELS[st]}</Badge>
                        <strong style={{ fontSize: 13 }}>{fmt(outstanding(i))}</strong>
                      </div>
                    </div>
                  );
                })}
                {open.count > 10 ? <p style={{ margin: "8px 0 0", fontSize: 12, color: MUTED_FG }}>Showing the 10 most urgent of {open.count}. See Invoices &amp; Payments for the rest.</p> : null}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function addDayBack(toKey) {
  var p = toKey.split("-");
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) - 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
