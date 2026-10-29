// src/pages/pet/DaycarePage.jsx
//
// Daycare (migration 114): today's dashboard, bookings, visit detail with care records, and settings.
// The client only READS the daycare tables; every change goes through pet_daycare_* database functions,
// which enforce capacity, double-booking, the lifecycle and billing. Checks in this file are advisory.
// Rates are Daycare services in the existing catalogue (Grooming & Services screen); this screen only
// maps them to plans. Who acted is attributed through the "Working as" picker (X-Pet-Actor): attribution,
// not authentication, because the device session is shared.
import React, { useEffect, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND, PRIMARY, SUCCESS, DESTRUCTIVE, WARNING } from "./theme";
import { vaccinationStatus } from "./petData";
import {
  PLAN_LABELS, STATUS_LABELS, STATUS_TONES, NEXT_STEP, LOG_KINDS, isPresent, isOverdue, minutesOverdue, dayKey, timeLabel, toInstant,
  durationLabel, dashboardCounts, planOptions, emptyVisit, validateVisit, validateLog, daycareErrorMessage, unitsFor,
} from "./daycareData";
import DaycareCheckoutModal from "./DaycareCheckoutModal";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

function addDay(key, n) { var d = new Date(key + "T12:00:00+03:00"); d.setUTCDate(d.getUTCDate() + n); return dayKey(d); }

async function fetchAll() {
  var since = encodeURIComponent(new Date(Date.now() - 45 * 86400000).toISOString());
  var res = await Promise.all([
    db("GET", "pet_daycare_settings", null, "?select=*&limit=1"),
    db("GET", "pet_daycare_visits", null, "?select=*&scheduled_start=gte." + since + "&order=scheduled_start.asc&limit=2000"),
    db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=2000"),
    db("GET", "pet_pets", null, "?select=id,customer_id,name,species,care_notes,archived_at&order=name.asc&limit=5000"),
    db("GET", "pet_vaccinations", null, "?select=id,pet_id,next_due_on&limit=5000"),
    db("GET", "pet_services", null, "?select=id,name,category,price,active&category=eq.Daycare&order=name.asc&limit=500"),
  ]);
  for (var i = 0; i < res.length; i++) if (!Array.isArray(res[i])) return null;
  var staff = await db("GET", "staff", null, "?select=id,name,active&order=name.asc");
  var inv = await db("GET", "pet_invoices", null, "?select=id,daycare_visit_id,invoice_number,status,total,amount_paid&daycare_visit_id=not.is.null&status=neq.void&limit=3000");
  return { settings: res[0][0] || null, visits: res[1], customers: res[2], pets: res[3], vaccs: res[4], services: res[5],
    staff: Array.isArray(staff) ? staff.filter(function (s) { return s.active !== false; }) : [], invoices: Array.isArray(inv) ? inv : [] };
}

function Kpi({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED_FG, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: tone || FOREGROUND, marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: MUTED_FG }}>{sub}</div> : null}
    </Card>
  );
}

export default function DaycarePage({ canEdit, onOpenInvoice }) {
  var dataS = useState(null); var data = dataS[0]; var setData = dataS[1];
  var loadS = useState("loading"); var load = loadS[0]; var setLoad = loadS[1];
  var attemptS = useState(0); var attempt = attemptS[0]; var setAttempt = attemptS[1];
  var tabS = useState("today"); var tab = tabS[0]; var setTab = tabS[1];
  var nowS = useState(new Date()); var now = nowS[0]; var setNow = nowS[1];
  var formS = useState(null); var form = formS[0]; var setForm = formS[1]; // {mode, id, draft}
  var detailS = useState(null); var detailId = detailS[0]; var setDetailId = detailS[1];
  var coS = useState(null); var checkoutVisit = coS[0]; var setCheckoutVisit = coS[1];
  var busyS = useState(false); var busy = busyS[0]; var setBusy = busyS[1];
  var errS = useState(""); var err = errS[0]; var setErr = errS[1];
  var flashS = useState(""); var flash = flashS[0]; var setFlash = flashS[1];
  var dayS = useState(dayKey(new Date())); var day = dayS[0]; var setDay = dayS[1];
  var qS = useState(""); var q = qS[0]; var setQ = qS[1];
  var stS = useState("all"); var statusFilter = stS[0]; var setStatusFilter = stS[1];

  useEffect(function () { var t = setInterval(function () { setNow(new Date()); }, 60000); return function () { clearInterval(t); }; }, []);
  useEffect(function () {
    var cancelled = false; setLoad("loading");
    fetchAll().then(function (d) { if (cancelled) return; if (!d) { setLoad("error"); return; } setData(d); setLoad("ready"); });
    return function () { cancelled = true; };
  }, [attempt]);
  async function refresh() { var d = await fetchAll(); if (d) setData(d); }

  if (load === "loading") return <div><PageHeader title="Daycare" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading today's visits…</Card></div>;
  if (load === "error" || !data) {
    return (
      <div><PageHeader title="Daycare" />
        <EmptyState title="Couldn't load daycare" description="Check your connection and try again."
          action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} />
      </div>
    );
  }

  var settings = data.settings;
  var today = dayKey(now);
  var plans = planOptions(settings, data.services);
  var petById = {}; data.pets.forEach(function (p) { petById[p.id] = p; });
  var custById = {}; data.customers.forEach(function (c) { custById[c.id] = c; });
  var staffById = {}; data.staff.forEach(function (s) { staffById[s.id] = s; });
  var invByVisit = {}; data.invoices.forEach(function (i) { invByVisit[i.daycare_visit_id] = i; });
  var grace = settings ? settings.overdue_grace_minutes : 0;
  var counts = dashboardCounts(data.visits, now, settings);
  function pname(v) { return petById[v.pet_id] ? petById[v.pet_id].name : "Pet"; }
  function oname(v) { return custById[v.customer_id] ? custById[v.customer_id].name : "Customer"; }

  async function run(name, args, okMsg) {
    setBusy(true); setErr("");
    var res = await dbRpcAuth(name, args);
    setBusy(false);
    if (res.error) { setErr(daycareErrorMessage(res.error)); return null; }
    setFlash(okMsg || ""); await refresh();
    return res;
  }
  async function step(v, to) {
    var ok = await run("pet_daycare_set_status", { p_id: v.id, p_status: to },
      to === "checked-in" ? pname(v) + " checked in." : to === "in-daycare" ? pname(v) + " moved to daycare." : to === "ready-for-pickup" ? pname(v) + " is ready for pickup." : to === "cancelled" ? "Booking cancelled." : "Marked no-show.");
    return !!ok;
  }

  function openNew(checkInNow) { setErr(""); setForm({ mode: "add", id: null, draft: Object.assign(emptyVisit(today), { check_in_now: !!checkInNow, start: timeLabel(now.toISOString()), end: "17:00" }) }); }
  function openEdit(v) {
    setErr("");
    setForm({ mode: "edit", id: v.id, plan: v.plan, draft: { customer_id: v.customer_id, pet_id: v.pet_id, plan: v.plan, date: dayKey(v.scheduled_start), start: timeLabel(v.scheduled_start), end: timeLabel(v.scheduled_end),
      staff_id: v.assigned_staff_id || "", instructions: v.customer_instructions || "", notes: v.notes || "", check_in_now: false } });
  }
  function setField(k, val) {
    var d = Object.assign({}, form.draft); d[k] = val;
    if (k === "customer_id") d.pet_id = "";
    setForm(Object.assign({}, form, { draft: d }));
  }
  async function saveForm() {
    var d = form.draft;
    var msg = form.mode === "edit" && form.status !== "booked" ? "" : validateVisit(d);
    if (msg) { setErr(msg); return; }
    var start = toInstant(d.date, d.start); var end = toInstant(d.date, d.end);
    var res = form.mode === "add"
      ? await run("pet_daycare_create_visit", { p_customer_id: d.customer_id, p_pet_id: d.pet_id, p_plan: d.plan, p_start: start, p_end: end, p_staff_id: d.staff_id || null,
          p_instructions: d.instructions, p_notes: d.notes, p_check_in_now: !!d.check_in_now }, d.check_in_now ? "Walk-in checked in." : "Booking created.")
      : await run("pet_daycare_update_visit", { p_id: form.id, p_start: start, p_end: end, p_staff_id: d.staff_id || null, p_instructions: d.instructions, p_notes: d.notes }, "Visit updated.");
    if (res) setForm(null);
  }

  // ---------- lists ----------
  var sorted = data.visits.slice().sort(function (a, b) { return new Date(a.scheduled_start) - new Date(b.scheduled_start); });
  var expected = sorted.filter(function (v) { return v.status === "booked" && dayKey(v.scheduled_start) === today; });
  var onSite = sorted.filter(isPresent);
  var doneToday = sorted.filter(function (v) { return v.status === "completed" && v.collected_at && dayKey(v.collected_at) === today; });
  var outstanding = 0;
  doneToday.forEach(function (v) { var i = invByVisit[v.id]; if (i) outstanding += Math.max(0, i.total - i.amount_paid); });

  function VisitRow({ v }) {
    var over = isOverdue(v, now, grace);
    var inv = invByVisit[v.id];
    var next = NEXT_STEP[v.status];
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid " + BORDER }}>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{pname(v)} <span style={{ fontWeight: 500, color: MUTED_FG }}>· {oname(v)}</span></div>
          <div style={{ fontSize: 12, color: MUTED_FG }}>{dayKey(v.scheduled_start) !== today ? dayKey(v.scheduled_start) + " · " : ""}{timeLabel(v.scheduled_start)}–{timeLabel(v.scheduled_end)} · {PLAN_LABELS[v.plan]}</div>
        </div>
        <Badge tone={STATUS_TONES[v.status]}>{STATUS_LABELS[v.status]}</Badge>
        {over ? <Badge tone="danger">Overdue {minutesOverdue(v, now)} min</Badge> : null}
        {inv && inv.total - inv.amount_paid > 0 ? <Badge tone="warning">Owes {fmt(inv.total - inv.amount_paid)}</Badge> : null}
        <div style={{ display: "flex", gap: 6 }}>
          {next ? <Button size="sm" disabled={busy} onClick={function () { step(v, next.to); }}>{next.label}</Button> : null}
          {v.status === "ready-for-pickup" ? <Button size="sm" disabled={busy} onClick={function () { setErr(""); setCheckoutVisit(v); }}>Check out</Button> : null}
          <Button size="sm" variant="outline" onClick={function () { setErr(""); setDetailId(v.id); }}>View</Button>
        </div>
      </div>
    );
  }

  var dayVisits = sorted.filter(function (v) { return dayKey(v.scheduled_start) === day; }).filter(function (v) {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    var s = q.trim().toLowerCase();
    return !s || (pname(v) + " " + oname(v)).toLowerCase().indexOf(s) !== -1;
  });

  var notConfigured = !settings || !settings.capacity;
  var detail = detailId ? data.visits.filter(function (v) { return v.id === detailId; })[0] : null;

  return (
    <div>
      <PageHeader title="Daycare" subtitle={notConfigured ? "Set capacity and rates to start taking bookings" : counts.present + " on site · " + counts.available + " places free"}
        actions={<>
          <Button variant="outline" disabled={notConfigured || plans.length === 0} onClick={function () { openNew(true); }}>Check in walk-in</Button>
          <Button disabled={notConfigured || plans.length === 0} onClick={function () { openNew(false); }}>New booking</Button>
        </>} />
      {flash ? <div role="status" style={{ background: "#E8F5EE", color: SUCCESS, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{flash}</div> : null}
      {err && !form && !detail && !checkoutVisit ? <ErrorLine>{err}</ErrorLine> : null}
      {notConfigured ? (
        <Card style={{ padding: 16, marginBottom: 14, fontSize: 13 }}>
          Daycare isn't set up yet. {canEdit ? "Add your Daycare rates in Grooming & Services (category Daycare), then set the capacity and rates in the Settings tab here." : "Ask an admin to set the capacity and daycare rates in the Settings tab."}
        </Card>
      ) : plans.length === 0 ? <Card style={{ padding: 16, marginBottom: 14, fontSize: 13 }}>No daycare rate is linked to a plan yet, so bookings are switched off. {canEdit ? "Link a rate in Settings." : "Ask an admin to link a rate in Settings."}</Card> : null}

      <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["today", "Today"], ["bookings", "Bookings"], ["settings", "Settings"]].map(function (t) {
          return <button key={t[0]} role="tab" aria-selected={tab === t[0]} onClick={function () { setTab(t[0]); setFlash(""); }} style={{ border: "1px solid " + BORDER, background: tab === t[0] ? PRIMARY : "#fff", color: tab === t[0] ? "#201707" : FOREGROUND, borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t[1]}</button>;
        })}
      </div>

      {tab === "today" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Kpi label="Expected today" value={counts.expected} />
            <Kpi label="Checked in" value={counts.checkedIn} />
            <Kpi label="In daycare" value={counts.inDaycare} />
            <Kpi label="Ready for pickup" value={counts.ready} />
            <Kpi label="Overdue" value={counts.overdue} tone={counts.overdue ? DESTRUCTIVE : undefined} />
            <Kpi label="Occupancy" value={counts.capacity ? counts.present + " / " + counts.capacity : "–"} sub={counts.capacity ? counts.occupancyPct + "% full" : "Capacity not set"} />
            <Kpi label="Completed today" value={counts.completedToday} sub={outstanding > 0 ? fmt(outstanding) + " outstanding" : "No balance due"} tone={outstanding > 0 ? WARNING : undefined} />
          </div>
          <Card style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Expected arrivals</div>
            {expected.length === 0 ? <div style={{ fontSize: 13, color: MUTED_FG, padding: "6px 0" }}>No more arrivals booked for today.</div> : expected.map(function (v) { return <VisitRow key={v.id} v={v} />; })}
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>On site now</div>
            {onSite.length === 0 ? <div style={{ fontSize: 13, color: MUTED_FG, padding: "6px 0" }}>No pets are checked in.</div> : onSite.map(function (v) { return <VisitRow key={v.id} v={v} />; })}
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Completed today</div>
            {doneToday.length === 0 ? <div style={{ fontSize: 13, color: MUTED_FG, padding: "6px 0" }}>Nothing completed yet.</div> : doneToday.map(function (v) { return <VisitRow key={v.id} v={v} />; })}
          </Card>
        </div>
      ) : null}

      {tab === "bookings" ? (
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 8 }}>
            <Button size="sm" variant="outline" ariaLabel="Previous day" onClick={function () { setDay(addDay(day, -1)); }}>←</Button>
            <input aria-label="Date" type="date" style={Object.assign({}, inputStyle, { width: 160 })} value={day} onChange={function (e) { if (e.target.value) setDay(e.target.value); }} />
            <Button size="sm" variant="outline" ariaLabel="Next day" onClick={function () { setDay(addDay(day, 1)); }}>→</Button>
            <Button size="sm" variant="ghost" onClick={function () { setDay(today); }}>Today</Button>
            <input aria-label="Search" placeholder="Search pet or owner" style={Object.assign({}, inputStyle, { width: 200 })} value={q} onChange={function (e) { setQ(e.target.value); }} />
            <select aria-label="Status" style={Object.assign({}, inputStyle, { width: 170 })} value={statusFilter} onChange={function (e) { setStatusFilter(e.target.value); }}>
              <option value="all">All statuses</option>
              {Object.keys(STATUS_LABELS).map(function (s) { return <option key={s} value={s}>{STATUS_LABELS[s]}</option>; })}
            </select>
          </div>
          {dayVisits.length === 0 ? <div style={{ fontSize: 13, color: MUTED_FG, padding: "16px 0" }}>No visits match for {day}.</div> : dayVisits.map(function (v) { return <VisitRow key={v.id} v={v} />; })}
        </Card>
      ) : null}

      {tab === "settings" ? <DaycareSettings settings={settings} services={data.services} canEdit={canEdit} onSaved={function () { setFlash("Daycare settings saved."); refresh(); }} /> : null}

      {/* New / edit booking */}
      {form ? (() => {
        var d = form.draft; var editing = form.mode === "edit";
        var owned = data.pets.filter(function (p) { return p.customer_id === d.customer_id && !p.archived_at; });
        var plan = plans.filter(function (p) { return p.plan === d.plan; })[0];
        var est = plan && d.date && d.start && d.end && d.end > d.start ? plan.price * unitsFor(d.plan, toInstant(d.date, d.start), toInstant(d.date, d.end)) : null;
        var pet = petById[d.pet_id];
        var vaccOverdue = pet && data.vaccs.some(function (x) { return x.pet_id === pet.id && vaccinationStatus(x.next_due_on) === "overdue"; });
        return (
          <Modal open onClose={function () { if (!busy) { setForm(null); setErr(""); } }} title={editing ? "Edit visit" : d.check_in_now ? "Check in walk-in" : "New daycare booking"}
            footer={<><Button variant="ghost" disabled={busy} onClick={function () { setForm(null); setErr(""); }}>Cancel</Button><Button disabled={busy} onClick={saveForm}>{busy ? "Saving…" : editing ? "Save changes" : d.check_in_now ? "Check in" : "Create booking"}</Button></>}>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Customer" htmlFor="dv-cust">
                <select id="dv-cust" disabled={editing} style={inputStyle} value={d.customer_id} onChange={function (e) { setField("customer_id", e.target.value); }}>
                  <option value="">Choose a customer</option>{data.customers.map(function (c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                </select>
              </Field>
              <Field label="Pet" htmlFor="dv-pet">
                <select id="dv-pet" disabled={editing || !d.customer_id} style={inputStyle} value={d.pet_id} onChange={function (e) { setField("pet_id", e.target.value); }}>
                  <option value="">{d.customer_id ? (owned.length ? "Choose a pet" : "This customer has no active pets") : "Choose a customer first"}</option>
                  {owned.map(function (p) { return <option key={p.id} value={p.id}>{p.name} ({p.species})</option>; })}
                </select>
              </Field>
              {vaccOverdue ? <Badge tone="warning">Vaccinations overdue for {pet.name}</Badge> : null}
              <Field label="Daycare option" htmlFor="dv-plan">
                <select id="dv-plan" disabled={editing} style={inputStyle} value={d.plan} onChange={function (e) { setField("plan", e.target.value); }}>
                  <option value="">Choose an option</option>{plans.map(function (p) { return <option key={p.plan} value={p.plan}>{p.label} · {fmt(p.price)}{p.plan === "hourly" ? " / hour" : ""}</option>; })}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 10 }}>
                <Field label="Date" htmlFor="dv-date"><input id="dv-date" type="date" disabled={editing && form.status !== "booked"} style={inputStyle} value={d.date} onChange={function (e) { setField("date", e.target.value); }} /></Field>
                <Field label="Drop-off" htmlFor="dv-start"><input id="dv-start" type="time" disabled={editing && form.status !== "booked"} style={inputStyle} value={d.start} onChange={function (e) { setField("start", e.target.value); }} /></Field>
                <Field label="Pickup" htmlFor="dv-end"><input id="dv-end" type="time" style={inputStyle} value={d.end} onChange={function (e) { setField("end", e.target.value); }} /></Field>
              </div>
              {est !== null ? <div style={{ fontSize: 13, color: MUTED_FG }}>Booked charge: <strong style={{ color: FOREGROUND }}>{fmt(est)}</strong> ({durationLabel(toInstant(d.date, d.start), toInstant(d.date, d.end))})</div> : null}
              <Field label="Assigned staff (optional)" htmlFor="dv-staff">
                <select id="dv-staff" style={inputStyle} value={d.staff_id} onChange={function (e) { setField("staff_id", e.target.value); }}>
                  <option value="">Unassigned</option>{data.staff.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                </select>
              </Field>
              <Field label="Customer instructions" htmlFor="dv-ins"><textarea id="dv-ins" rows={2} maxLength={500} style={inputStyle} value={d.instructions} onChange={function (e) { setField("instructions", e.target.value); }} /></Field>
              <Field label="Notes" htmlFor="dv-notes"><textarea id="dv-notes" rows={2} maxLength={500} style={inputStyle} value={d.notes} onChange={function (e) { setField("notes", e.target.value); }} /></Field>
              <ErrorLine>{err}</ErrorLine>
            </div>
          </Modal>
        );
      })() : null}

      {/* Visit detail */}
      {detail ? <VisitDetail key={detail.id} v={detail} pet={petById[detail.pet_id]} owner={custById[detail.customer_id]} staffById={staffById} invoice={invByVisit[detail.id]}
        vaccOverdue={data.vaccs.some(function (x) { return x.pet_id === detail.pet_id && vaccinationStatus(x.next_due_on) === "overdue"; })}
        now={now} grace={grace} busy={busy} err={err}
        onClose={function () { setDetailId(null); setErr(""); }}
        onStep={function (to) { return step(detail, to); }}
        onEdit={function () { setDetailId(null); openEdit(detail); setForm(function (f) { return Object.assign({}, f, { status: detail.status }); }); }}
        onCheckout={function () { setDetailId(null); setCheckoutVisit(detail); }}
        onOpenInvoice={onOpenInvoice}
        onLog={function (args) { return run("pet_daycare_add_log", Object.assign({ p_visit_id: detail.id }, args), "Care record added."); }} /> : null}

      {checkoutVisit ? <DaycareCheckoutModal visit={checkoutVisit} petName={pname(checkoutVisit)} ownerName={oname(checkoutVisit)}
        onClose={function () { setCheckoutVisit(null); }} onDone={function () { refresh(); setFlash("Pickup recorded."); }} onOpenInvoice={function (id) { setCheckoutVisit(null); onOpenInvoice(id); }} /> : null}
    </div>
  );
}

function VisitDetail({ v, pet, owner, staffById, invoice, vaccOverdue, now, grace, busy, err, onClose, onStep, onEdit, onCheckout, onOpenInvoice, onLog }) {
  var logsS = useState(null); var logs = logsS[0]; var setLogs = logsS[1];
  var draftS = useState({ kind: "feeding", details: "", medication_name: "", dose: "" }); var draft = draftS[0]; var setDraft = draftS[1];
  var lerrS = useState(""); var lerr = lerrS[0]; var setLerr = lerrS[1];
  var [confirm, setConfirm] = useState(null);
  var present = isPresent(v);
  function loadLogs() {
    return db("GET", "pet_daycare_care_logs", null, "?select=*&visit_id=eq." + v.id + "&order=occurred_at.desc&limit=200").then(function (r) { setLogs(Array.isArray(r) ? r : []); });
  }
  useEffect(function () { loadLogs(); }, [v.id, v.status]);
  async function addLog() {
    var m = validateLog(draft); if (m) { setLerr(m); return; }
    setLerr("");
    var res = await onLog({ p_kind: draft.kind, p_details: draft.details, p_medication_name: draft.medication_name, p_dose: draft.dose });
    if (res) { setDraft({ kind: draft.kind, details: "", medication_name: "", dose: "" }); loadLogs(); }
  }
  var next = NEXT_STEP[v.status];
  var over = isOverdue(v, now, grace);
  var row = function (k, val) { return <div style={{ display: "contents" }}><span style={{ color: MUTED_FG }}>{k}</span><span>{val}</span></div>; };
  return (
    <Modal open onClose={busy ? function () {} : onClose} title={(pet ? pet.name : "Pet") + " · " + (owner ? owner.name : "")} width={620}
      footer={<>
        {v.status === "booked" ? <><Button variant="ghost-danger" disabled={busy} onClick={function () { setConfirm("cancelled"); }}>Cancel booking</Button><Button variant="ghost-danger" disabled={busy} onClick={function () { setConfirm("no-show"); }}>No-show</Button></> : null}
        {v.status === "booked" || present ? <Button variant="outline" disabled={busy} onClick={onEdit}>Edit</Button> : null}
        {next ? <Button disabled={busy} onClick={function () { onStep(next.to); }}>{next.label}</Button> : null}
        {v.status === "ready-for-pickup" ? <Button disabled={busy} onClick={onCheckout}>Check out</Button> : null}
        {v.status === "completed" && !invoice ? <Button disabled={busy} onClick={onCheckout}>Create invoice</Button> : null}
        {invoice ? <Button variant="outline" onClick={function () { onOpenInvoice(invoice.id); }}>Open invoice {invoice.invoice_number}</Button> : null}
      </>}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={STATUS_TONES[v.status]}>{STATUS_LABELS[v.status]}</Badge>
          {over ? <Badge tone="danger">Overdue {minutesOverdue(v, now)} min</Badge> : null}
          {vaccOverdue ? <Badge tone="warning">Vaccinations overdue</Badge> : null}
        </div>
        {pet && pet.care_notes ? <div style={{ background: MUTED, borderRadius: 10, padding: "8px 12px", fontSize: 13 }}><strong>Care alert:</strong> {pet.care_notes}</div> : null}
        {v.customer_instructions ? <div style={{ fontSize: 13 }}><strong>Owner's instructions:</strong> {v.customer_instructions}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 13 }}>
          {row("Plan", PLAN_LABELS[v.plan] + " · " + v.service_name + " · " + fmt(v.unit_price) + (v.plan === "hourly" ? " × " + v.units : ""))}
          {row("Scheduled", dayKey(v.scheduled_start) + " " + timeLabel(v.scheduled_start) + "–" + timeLabel(v.scheduled_end))}
          {row("Arrived", v.checked_in_at ? timeLabel(v.checked_in_at) + (v.checked_in_by && staffById[v.checked_in_by] ? " · " + staffById[v.checked_in_by].name : "") : "–")}
          {row("Ready", v.ready_at ? timeLabel(v.ready_at) : "–")}
          {row("Collected", v.collected_at ? timeLabel(v.collected_at) + (v.collected_by && staffById[v.collected_by] ? " · " + staffById[v.collected_by].name : "") : "–")}
          {row("Assigned", v.assigned_staff_id && staffById[v.assigned_staff_id] ? staffById[v.assigned_staff_id].name : "Unassigned")}
          {v.notes ? row("Notes", v.notes) : null}
        </div>
        {present ? (
          <div style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Add a care record</div>
            <select aria-label="Record type" style={inputStyle} value={draft.kind} onChange={function (e) { setDraft(Object.assign({}, draft, { kind: e.target.value })); }}>
              {Object.keys(LOG_KINDS).map(function (k) { return <option key={k} value={k}>{LOG_KINDS[k]}</option>; })}
            </select>
            {draft.kind === "medication" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input aria-label="Medication name" placeholder="Medication" style={inputStyle} value={draft.medication_name} onChange={function (e) { setDraft(Object.assign({}, draft, { medication_name: e.target.value })); }} />
                <input aria-label="Dose given" placeholder="Dose given" style={inputStyle} value={draft.dose} onChange={function (e) { setDraft(Object.assign({}, draft, { dose: e.target.value })); }} />
              </div>
            ) : null}
            <textarea aria-label="Details" rows={2} maxLength={500} placeholder={draft.kind === "incident" || draft.kind === "behaviour" || draft.kind === "note" ? "What happened? (required)" : "Details (optional)"} style={inputStyle} value={draft.details} onChange={function (e) { setDraft(Object.assign({}, draft, { details: e.target.value })); }} />
            <div style={{ fontSize: 11, color: MUTED_FG }}>Records can't be edited once saved. Add a new note to correct one.</div>
            <ErrorLine>{lerr || (err && !confirm ? err : "")}</ErrorLine>
            <div><Button size="sm" disabled={busy} onClick={addLog}>Add record</Button></div>
          </div>
        ) : null}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Care log</div>
          {logs === null ? <div style={{ fontSize: 13, color: MUTED_FG }}>Loading…</div> : logs.length === 0 ? <div style={{ fontSize: 13, color: MUTED_FG }}>No care records yet.</div> : logs.map(function (l) {
            return (
              <div key={l.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid " + BORDER, fontSize: 13 }}>
                <span style={{ color: MUTED_FG, minWidth: 44 }}>{timeLabel(l.occurred_at)}</span>
                <span><strong>{LOG_KINDS[l.kind]}</strong>{l.medication_name ? ": " + l.medication_name + " (" + l.dose + ")" : ""}{l.details ? " – " + l.details : ""}
                  {l.recorded_by && staffById[l.recorded_by] ? <span style={{ color: MUTED_FG }}> · {staffById[l.recorded_by].name}</span> : null}</span>
              </div>
            );
          })}
        </div>
        {confirm ? (
          <div style={{ background: MUTED, borderRadius: 10, padding: 12, fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>{confirm === "cancelled" ? "Cancel this booking?" : "Mark this visit as a no-show?"}</div>
            <ErrorLine>{err}</ErrorLine>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="danger" disabled={busy} onClick={async function () { var ok = await onStep(confirm); if (ok) onClose(); }}>Yes, {confirm === "cancelled" ? "cancel it" : "mark no-show"}</Button>
              <Button size="sm" variant="ghost" onClick={function () { setConfirm(null); }}>Keep it</Button>
            </div>
          </div>
        ) : null}
        {!confirm && !present ? <ErrorLine>{err}</ErrorLine> : null}
      </div>
    </Modal>
  );
}

function DaycareSettings({ settings, services, canEdit, onSaved }) {
  var s = settings || {};
  var dS = useState({ capacity: s.capacity || "", full: s.full_day_service_id || "", half: s.half_day_service_id || "", hourly: s.hourly_service_id || "", grace: s.overdue_grace_minutes || 0, late: !!s.late_fee_enabled, pin: "" });
  var d = dS[0]; var setD = dS[1];
  var errS = useState(""); var err = errS[0]; var setErr = errS[1];
  var busyS = useState(false); var busy = busyS[0]; var setBusy = busyS[1];
  var active = services.filter(function (x) { return x.active !== false; });
  function set(k, v) { var n = Object.assign({}, d); n[k] = v; setD(n); }
  async function save() {
    var cap = Number(d.capacity); var grace = Number(d.grace);
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) { setErr("Capacity must be a whole number from 1 to 500."); return; }
    if (!Number.isInteger(grace) || grace < 0 || grace > 1440) { setErr("Grace period must be 0 to 1440 minutes."); return; }
    if (d.late && !d.hourly) { setErr("Choose an hourly rate before switching on late-pickup charges."); return; }
    if (!d.pin) { setErr("Enter the admin PIN to save."); return; }
    setBusy(true); setErr("");
    var res = await dbRpcAuth("pet_daycare_save_settings", { p_admin_pin: d.pin, p_capacity: cap, p_full_day_service: d.full || null, p_half_day_service: d.half || null, p_hourly_service: d.hourly || null, p_grace_minutes: grace, p_late_fee_enabled: !!d.late });
    setBusy(false);
    if (res.error) { setErr(daycareErrorMessage(res.error)); return; }
    if (res.data !== true) { setErr("That PIN wasn't accepted."); return; }
    set("pin", ""); onSaved();
  }
  var sel = function (key, label) {
    return (
      <Field label={label} htmlFor={"ds-" + key}>
        <select id={"ds-" + key} disabled={!canEdit} style={inputStyle} value={d[key]} onChange={function (e) { set(key, e.target.value); }}>
          <option value="">Not offered</option>{active.map(function (x) { return <option key={x.id} value={x.id}>{x.name} · {fmt(x.price)}</option>; })}
        </select>
      </Field>
    );
  };
  return (
    <Card style={{ padding: 16, display: "grid", gap: 12, maxWidth: 560 }}>
      {!canEdit ? <div style={{ fontSize: 13, color: MUTED_FG }}>Only an admin can change these settings.</div> : null}
      {active.length === 0 ? <div style={{ fontSize: 13, color: MUTED_FG }}>No Daycare rates exist yet. Add them in Grooming & Services with category "Daycare" (price per visit, or per hour for the hourly rate).</div> : null}
      <Field label="Capacity (pets at one time)" htmlFor="ds-cap"><input id="ds-cap" inputMode="numeric" disabled={!canEdit} style={inputStyle} value={d.capacity} onChange={function (e) { set("capacity", e.target.value); }} /></Field>
      {sel("full", "Full-day rate")}{sel("half", "Half-day rate")}{sel("hourly", "Hourly rate")}
      <Field label="Overdue after (minutes past pickup time)" htmlFor="ds-grace"><input id="ds-grace" inputMode="numeric" disabled={!canEdit} style={inputStyle} value={d.grace} onChange={function (e) { set("grace", e.target.value); }} /></Field>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
        <input type="checkbox" disabled={!canEdit} checked={d.late} onChange={function (e) { set("late", e.target.checked); }} />
        <span>Charge for late pickup: each started hour after the overdue time is billed at the hourly rate. Staff can reduce or waive it at checkout. Off by default.</span>
      </label>
      {canEdit ? (
        <>
          <Field label="Admin PIN (required to save)" htmlFor="ds-pin"><input id="ds-pin" type="password" autoComplete="off" inputMode="numeric" style={inputStyle} value={d.pin} onChange={function (e) { set("pin", e.target.value); }} /></Field>
          <ErrorLine>{err}</ErrorLine>
          <div><Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</Button></div>
          <div style={{ fontSize: 11, color: MUTED_FG }}>Lowering capacity doesn't cancel existing bookings; it limits new ones.</div>
        </>
      ) : null}
    </Card>
  );
}
