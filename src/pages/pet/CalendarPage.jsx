// src/pages/pet/CalendarPage.jsx
//
// Calendar & Bookings (Phase 6). Day / week / month views over pet_bookings
// (migration 088). The client only READS the tables; every create, reschedule
// and status change goes through the pet_* database functions so conflicts are
// stopped by the database itself. The clash warning in the form is advisory.
//
// Not built yet: working hours / staff availability rules, editing the services
// of an existing booking (cancel and rebook), public online booking.
import React, { useEffect, useMemo, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND, PRIMARY, CARD } from "./theme";
import {
  STATUSES, STATUS_LABELS, STATUS_TONES, NEXT_STATUSES, EDITABLE, isActive, bookingErrorMessage, bookingTotal, totalMinutes,
  weekDays, monthGrid, addDays, startOfDay, dateKey, toDateInput, toTimeInput, fromInputs, addMinutes, formatRange, formatTime,
  bookingsOnDay, rangeBounds, findConflict, validateBooking, filterBookings,
} from "./bookingData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

var VIEWS = [["day", "Day"], ["week", "Week"], ["month", "Month"]];
var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var BOOKABLE = ["Grooming", "Add-on"];

function emptyDraft(day) {
  return { customer_id: "", pet_id: "", service_ids: [], staff_id: "", date: toDateInput(day), start_time: "09:00", end_time: "10:00",
    notes: "", walk_in: false, endTouched: false };
}
function titleFor(view, anchor) {
  if (view === "day") return anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "week") { var d = weekDays(anchor); return d[0].toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " – " + d[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function CalendarPage() {
  var viewState = useState("week"); var view = viewState[0]; var setView = viewState[1];
  var anchorState = useState(startOfDay(new Date())); var anchor = anchorState[0]; var setAnchor = anchorState[1];
  var lookState = useState(null); var look = lookState[0]; var setLook = lookState[1]; // {customers, pets, staff, services}
  var lookStatusState = useState("loading"); var lookStatus = lookStatusState[0]; var setLookStatus = lookStatusState[1];
  var bookState = useState([]); var bookings = bookState[0]; var setBookings = bookState[1];
  var bookStatusState = useState("loading"); var bookStatus = bookStatusState[0]; var setBookStatus = bookStatusState[1];
  var tickState = useState(0); var tick = tickState[0]; var setTick = tickState[1];
  var fState = useState({ q: "", status: "all", staff_id: "all" }); var filters = fState[0]; var setFilters = fState[1];
  var formState = useState(null); var form = formState[0]; var setForm = formState[1]; // {mode, id, draft}
  var detailState = useState(null); var detailId = detailState[0]; var setDetailId = detailState[1];
  var confirmState = useState(null); var confirmCancel = confirmState[0]; var setConfirmCancel = confirmState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  useEffect(function () {
    var cancelled = false;
    setLookStatus("loading");
    Promise.all([
      db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=2000"),
      db("GET", "pet_pets", null, "?select=id,customer_id,name,species&order=name.asc&limit=5000"),
      db("GET", "staff", null, "?select=id,name,role,active&order=name.asc&limit=500"),
      db("GET", "pet_services", null, "?select=id,name,category,price,duration_minutes,active&active=eq.true&order=name.asc&limit=1000"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- an error, not "no data".
      if (!res.every(Array.isArray)) { setLookStatus("error"); return; }
      setLook({ customers: res[0], pets: res[1], staff: res[2].filter(function (s) { return s.active !== false; }), services: res[3] });
      setLookStatus("ready");
    });
    return function () { cancelled = true; };
  }, [tick]);

  var anchorKey = dateKey(anchor);
  useEffect(function () {
    var cancelled = false;
    var b = rangeBounds(view, anchor);
    setBookStatus("loading");
    db("GET", "pet_bookings", null,
      "?select=*,pet_booking_services(*)&starts_at=gte." + b.from.toISOString() + "&starts_at=lt." + b.to.toISOString() +
      "&order=starts_at.asc&limit=2000").then(function (res) {
      if (cancelled) return;
      if (!Array.isArray(res)) { setBookStatus("error"); return; }
      setBookings(res); setBookStatus("ready");
    });
    return function () { cancelled = true; };
  }, [view, anchorKey, tick]);

  var maps = useMemo(function () {
    var m = { customers: {}, pets: {}, staff: {} };
    if (look) {
      look.customers.forEach(function (c) { m.customers[c.id] = c; });
      look.pets.forEach(function (p) { m.pets[p.id] = p; });
      look.staff.forEach(function (s) { m.staff[s.id] = s; });
    }
    return m;
  }, [look]);

  if (lookStatus === "loading") {
    return <div><PageHeader title="Calendar & Bookings" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading the calendar…</Card></div>;
  }
  if (lookStatus === "error") {
    return (
      <div>
        <PageHeader title="Calendar & Bookings" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load the calendar" description="Check your connection and try again."
            action={<Button onClick={function () { setTick(tick + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  function names(b) {
    var p = maps.pets[b.pet_id]; var c = maps.customers[b.customer_id];
    return { pet: p ? p.name : "Unknown pet", customer: c ? c.name : "Unknown customer", staff: b.staff_id && maps.staff[b.staff_id] ? maps.staff[b.staff_id].name : "Unassigned" };
  }
  var shown = filterBookings(bookings, filters, names);
  var detail = detailId ? bookings.filter(function (b) { return b.id === detailId; })[0] : null;
  var draft = form ? form.draft : null;
  var bookableServices = look.services.filter(function (s) { return BOOKABLE.indexOf(s.category) !== -1; });

  function step(n) {
    if (view === "day") setAnchor(addDays(anchor, n));
    else if (view === "week") setAnchor(addDays(anchor, 7 * n));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));
  }
  function setF(k, v) { var o = {}; o[k] = v; setFilters(Object.assign({}, filters, o)); }

  function openAdd(day) { setForm({ mode: "add", id: null, draft: emptyDraft(day || (view === "month" ? new Date() : anchor)) }); setErr(""); }
  function openEdit(b) {
    var s = new Date(b.starts_at); var e = new Date(b.ends_at);
    setForm({ mode: "edit", id: b.id, booking: b, draft: { customer_id: b.customer_id, pet_id: b.pet_id,
      service_ids: (b.pet_booking_services || []).map(function (l) { return l.service_id; }), staff_id: b.staff_id || "",
      date: toDateInput(s), start_time: toTimeInput(s), end_time: toTimeInput(e), notes: b.notes || "", walk_in: !!b.walk_in, endTouched: true } });
    setDetailId(null); setErr("");
  }
  function closeForm() { if (!saving) { setForm(null); setErr(""); } }

  // Changing services or the start time re-derives the end time until the user edits it.
  function patchDraft(patch) {
    var next = Object.assign({}, form.draft, patch);
    if (form.mode === "add" && !next.endTouched && ("service_ids" in patch || "start_time" in patch || "date" in patch)) {
      var start = fromInputs(next.date, next.start_time);
      var mins = totalMinutes(next.service_ids.map(function (id) { return look.services.filter(function (s) { return s.id === id; })[0]; }).filter(Boolean)) || 60;
      if (start) next.end_time = toTimeInput(addMinutes(start, mins));
    }
    setForm(Object.assign({}, form, { draft: next }));
  }
  function toggleService(id) {
    var cur = form.draft.service_ids;
    patchDraft({ service_ids: cur.indexOf(id) === -1 ? cur.concat([id]) : cur.filter(function (x) { return x !== id; }) });
  }

  async function saveBooking() {
    if (saving) return;
    var msg = validateBooking(form.draft);
    if (msg) { setErr(msg); return; }
    var start = fromInputs(form.draft.date, form.draft.start_time); var end = fromInputs(form.draft.date, form.draft.end_time);
    setSaving(true); setErr("");
    var res = form.mode === "add"
      ? await dbRpcAuth("pet_create_booking", {
        p_customer_id: form.draft.customer_id, p_pet_id: form.draft.pet_id, p_staff_id: form.draft.staff_id || null,
        p_starts_at: start.toISOString(), p_ends_at: end.toISOString(), p_service_ids: form.draft.service_ids,
        p_walk_in: !!form.draft.walk_in, p_notes: form.draft.notes || null })
      : await dbRpcAuth("pet_update_booking", {
        p_id: form.id, p_staff_id: form.draft.staff_id || null, p_starts_at: start.toISOString(), p_ends_at: end.toISOString(),
        p_notes: form.draft.notes || null });
    setSaving(false);
    if (res.error) { setErr(bookingErrorMessage(res.error)); return; }
    setForm(null);
    // Jump to the booking's day so the user sees it, and reload from the database.
    if (view === "month") { setAnchor(startOfDay(start)); } else if (view === "week") { setAnchor(startOfDay(start)); } else setAnchor(startOfDay(start));
    setTick(tick + 1);
  }

  async function changeStatus(b, status) {
    if (saving) return;
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_set_booking_status", { p_id: b.id, p_status: status });
    setSaving(false);
    if (res.error) { setErr(bookingErrorMessage(res.error)); setConfirmCancel(null); return; }
    setConfirmCancel(null);
    setBookings(bookings.map(function (x) { return x.id === b.id ? Object.assign({}, x, { status: status }) : x; }));
  }

  function chip(b) {
    var n = names(b);
    return (
      <button key={b.id} type="button" onClick={function () { setErr(""); setDetailId(b.id); }}
        aria-label={"Open booking for " + n.pet + " at " + formatTime(b.starts_at)}
        style={{ display: "block", width: "100%", textAlign: "left", border: "1px solid " + BORDER, borderRadius: 10, background: CARD,
          padding: "6px 8px", marginBottom: 6, cursor: "pointer", opacity: isActive(b) ? 1 : 0.6, fontFamily: "inherit" }}>
        <div style={{ fontSize: 11, color: MUTED_FG }}>{formatRange(b)}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: FOREGROUND }}>{n.pet}</div>
        <Badge tone={STATUS_TONES[b.status]}>{STATUS_LABELS[b.status]}</Badge>
      </button>
    );
  }

  var conflict = null;
  if (form && form.draft) {
    var cs = fromInputs(form.draft.date, form.draft.start_time); var ce = fromInputs(form.draft.date, form.draft.end_time);
    if (cs && ce && ce > cs) conflict = findConflict(bookings, { starts: cs, ends: ce, pet_id: form.draft.pet_id, staff_id: form.draft.staff_id || null }, form.id);
  }
  var petsOfCustomer = form ? look.pets.filter(function (p) { return p.customer_id === form.draft.customer_id; }) : [];

  return (
    <div>
      <PageHeader title="Calendar & Bookings" subtitle="Appointments for grooming and add-on services. Boarding stays are managed under Boarding."
        actions={<Button onClick={function () { openAdd(); }}>+ New booking</Button>} />

      <Card style={{ padding: 12, marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Button size="sm" variant="outline" onClick={function () { step(-1); }} ariaLabel="Previous">‹</Button>
        <Button size="sm" variant="outline" onClick={function () { setAnchor(startOfDay(new Date())); }}>Today</Button>
        <Button size="sm" variant="outline" onClick={function () { step(1); }} ariaLabel="Next">›</Button>
        <strong style={{ fontSize: 14, margin: "0 8px" }}>{titleFor(view, anchor)}</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {VIEWS.map(function (v) {
            return <Button key={v[0]} size="sm" variant={view === v[0] ? undefined : "outline"} onClick={function () { setView(v[0]); }}>{v[1]}</Button>;
          })}
        </div>
      </Card>

      <Card style={{ padding: 12, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
        <input aria-label="Search bookings" placeholder="Search pet, owner or service" value={filters.q}
          onChange={function (e) { setF("q", e.target.value); }} style={Object.assign({}, inputStyle, { flex: "1 1 200px", width: "auto" })} />
        <select aria-label="Filter by status" value={filters.status} onChange={function (e) { setF("status", e.target.value); }} style={Object.assign({}, inputStyle, { width: 150 })}>
          <option value="all">All statuses</option>
          {STATUSES.map(function (s) { return <option key={s} value={s}>{STATUS_LABELS[s]}</option>; })}
        </select>
        <select aria-label="Filter by staff" value={filters.staff_id} onChange={function (e) { setF("staff_id", e.target.value); }} style={Object.assign({}, inputStyle, { width: 160 })}>
          <option value="all">All staff</option>
          {look.staff.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
        </select>
      </Card>

      {bookStatus === "error" ? (
        <Card><EmptyState title="Couldn't load bookings" description="Check your connection and try again."
          action={<Button onClick={function () { setTick(tick + 1); }}>Try again</Button>} /></Card>
      ) : bookStatus === "loading" ? (
        <Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading bookings…</Card>
      ) : view === "day" ? (
        shown.length === 0 ? (
          <Card><EmptyState title="No bookings this day" description="Create a booking to fill the schedule."
            action={<Button onClick={function () { openAdd(anchor); }}>+ New booking</Button>} /></Card>
        ) : <div>{bookingsOnDay(shown, anchor).map(function (b) {
          var n = names(b);
          return (
            <Card key={b.id} style={{ padding: 12, marginBottom: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", opacity: isActive(b) ? 1 : 0.6 }}>
              <div style={{ minWidth: 110, fontWeight: 700, fontSize: 13 }}>{formatRange(b)}</div>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{n.pet} <span style={{ color: MUTED_FG, fontWeight: 500 }}>· {n.customer}</span></div>
                <div style={{ fontSize: 12, color: MUTED_FG }}>{(b.pet_booking_services || []).map(function (l) { return l.service_name; }).join(", ")} · {n.staff}</div>
              </div>
              <Badge tone={STATUS_TONES[b.status]}>{STATUS_LABELS[b.status]}</Badge>
              <Button size="sm" variant="outline" onClick={function () { setErr(""); setDetailId(b.id); }} ariaLabel={"Open booking for " + n.pet}>Open</Button>
            </Card>
          );
        })}</div>
      ) : view === "week" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {weekDays(anchor).map(function (d) {
            var list = bookingsOnDay(shown, d);
            var today = dateKey(d) === dateKey(new Date());
            return (
              <Card key={dateKey(d)} style={{ padding: 8, borderColor: today ? PRIMARY : BORDER }}>
                <button type="button" onClick={function () { setAnchor(d); setView("day"); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, color: FOREGROUND, padding: "0 0 6px" }}>
                  {DOW[(d.getDay() + 6) % 7]} {d.getDate()}
                </button>
                {list.length === 0 ? <div style={{ fontSize: 11, color: MUTED_FG }}>No bookings</div> : list.map(chip)}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ padding: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {DOW.map(function (d) { return <div key={d} style={{ fontSize: 11, fontWeight: 700, color: MUTED_FG, textAlign: "center" }}>{d}</div>; })}
            {monthGrid(anchor).flat().map(function (d) {
              var count = bookingsOnDay(shown, d).length;
              var inMonth = d.getMonth() === anchor.getMonth();
              return (
                <button key={dateKey(d)} type="button" onClick={function () { setAnchor(d); setView("day"); }}
                  aria-label={d.toDateString() + (count ? ", " + count + " bookings" : ", no bookings")}
                  style={{ minHeight: 56, border: "1px solid " + BORDER, borderRadius: 8, background: inMonth ? CARD : MUTED, cursor: "pointer",
                    fontFamily: "inherit", textAlign: "left", padding: 6, color: inMonth ? FOREGROUND : MUTED_FG }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{d.getDate()}</div>
                  {count ? <Badge tone="info">{count} {count === 1 ? "booking" : "bookings"}</Badge> : null}
                </button>
              );
            })}
          </div>
        </Card>
      )}
      {!form && !detail ? <ErrorLine>{err}</ErrorLine> : null}

      <Modal open={!!form} onClose={closeForm} title={form && form.mode === "edit" ? "Reschedule booking" : "New booking"}
        description={form && form.mode === "edit" ? "Change the time, staff member or notes. To change services, cancel and rebook." : "Choose the owner, pet, services and time."}
        footer={<>
          <Button variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Button>
          <Button onClick={saveBooking} disabled={saving}>{saving ? "Saving…" : form && form.mode === "edit" ? "Save changes" : "Create booking"}</Button>
        </>}>
        {draft ? (
          <div style={{ display: "grid", gap: 12 }}>
            {form.mode === "add" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Customer" htmlFor="bk-customer">
                  <select id="bk-customer" style={inputStyle} value={draft.customer_id} onChange={function (e) { patchDraft({ customer_id: e.target.value, pet_id: "" }); }}>
                    <option value="">Choose a customer</option>
                    {look.customers.map(function (c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                  </select>
                </Field>
                <Field label="Pet" htmlFor="bk-pet">
                  <select id="bk-pet" style={inputStyle} value={draft.pet_id} disabled={!draft.customer_id} onChange={function (e) { patchDraft({ pet_id: e.target.value }); }}>
                    <option value="">{draft.customer_id ? (petsOfCustomer.length ? "Choose a pet" : "No pets for this customer") : "Choose a customer first"}</option>
                    {petsOfCustomer.map(function (p) { return <option key={p.id} value={p.id}>{p.name} ({p.species})</option>; })}
                  </select>
                </Field>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13 }}><strong>{names(form.booking).pet}</strong> · {names(form.booking).customer}</p>
            )}
            {form.mode === "add" ? (
              <fieldset style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: "8px 12px", margin: 0 }}>
                <legend style={{ fontSize: 12, fontWeight: 600, color: MUTED_FG, padding: "0 4px" }}>Services</legend>
                {bookableServices.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>No active Grooming or Add-on services. Add some in the Grooming tab first.</p> : (
                  <div style={{ display: "grid", gap: 4 }}>
                    {bookableServices.map(function (s) {
                      return (
                        <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: FOREGROUND }}>
                          <input type="checkbox" checked={draft.service_ids.indexOf(s.id) !== -1} onChange={function () { toggleService(s.id); }} />
                          <span style={{ flex: 1 }}>{s.name}</span>
                          <span style={{ color: MUTED_FG }}>{fmt(s.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Date" htmlFor="bk-date"><input id="bk-date" type="date" style={inputStyle} value={draft.date} onChange={function (e) { patchDraft({ date: e.target.value }); }} /></Field>
              <Field label="Start" htmlFor="bk-start"><input id="bk-start" type="time" style={inputStyle} value={draft.start_time} onChange={function (e) { patchDraft({ start_time: e.target.value }); }} /></Field>
              <Field label="End" htmlFor="bk-end"><input id="bk-end" type="time" style={inputStyle} value={draft.end_time} onChange={function (e) { patchDraft({ end_time: e.target.value, endTouched: true }); }} /></Field>
            </div>
            <Field label="Staff member (optional)" htmlFor="bk-staff">
              <select id="bk-staff" style={inputStyle} value={draft.staff_id} onChange={function (e) { patchDraft({ staff_id: e.target.value }); }}>
                <option value="">Unassigned</option>
                {look.staff.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
              </select>
            </Field>
            <Field label="Notes (optional)" htmlFor="bk-notes"><textarea id="bk-notes" rows={2} style={inputStyle} value={draft.notes} onChange={function (e) { patchDraft({ notes: e.target.value }); }} /></Field>
            {form.mode === "add" ? (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}>
                <input type="checkbox" checked={draft.walk_in} onChange={function (e) { patchDraft({ walk_in: e.target.checked }); }} />
                Walk-in (starts as checked in)
              </label>
            ) : null}
            {conflict ? <p role="status" style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>
              Heads up: {conflict === "staff" ? "this staff member already has a booking" : "this pet already has a booking"} that overlaps this time. The system will refuse a clash if you save.</p> : null}
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!detail} onClose={function () { setDetailId(null); setErr(""); }} title={detail ? names(detail).pet + " · " + names(detail).customer : ""}
        description={detail ? new Date(detail.starts_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + ", " + formatRange(detail) : ""}
        footer={detail ? <>
          <Button variant="ghost" onClick={function () { setDetailId(null); setErr(""); }}>Close</Button>
          {EDITABLE.indexOf(detail.status) !== -1 ? <Button variant="outline" onClick={function () { openEdit(detail); }}>Reschedule</Button> : null}
        </> : null}>
        {detail ? (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <Badge tone={STATUS_TONES[detail.status]}>{STATUS_LABELS[detail.status]}</Badge>
              {detail.walk_in ? <Badge tone="neutral">Walk-in</Badge> : null}
              <span style={{ fontSize: 12, color: MUTED_FG }}>Staff: {names(detail).staff}</span>
            </div>
            {(detail.pet_booking_services || []).map(function (l) {
              return <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span>{l.service_name}</span><span>{fmt(l.price)}</span></div>;
            })}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, borderTop: "1px solid " + BORDER, marginTop: 6, paddingTop: 6 }}>
              <span>Total</span><span>{fmt(bookingTotal(detail.pet_booking_services))}</span>
            </div>
            {detail.notes ? <p style={{ margin: "10px 0 0", fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>{detail.notes}</p> : null}
            {NEXT_STATUSES[detail.status].length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                {NEXT_STATUSES[detail.status].map(function (s) {
                  return s === "cancelled"
                    ? <Button key={s} size="sm" variant="ghost-danger" disabled={saving} onClick={function () { setErr(""); setConfirmCancel(detail); }}>Cancel booking</Button>
                    : <Button key={s} size="sm" variant={s === "no-show" ? "outline" : undefined} disabled={saving} onClick={function () { changeStatus(detail, s); }}>
                      {s === "confirmed" ? "Confirm" : s === "checked-in" ? "Check in" : s === "in-progress" ? "Start" : s === "completed" ? "Complete" : "Mark no-show"}
                    </Button>;
                })}
              </div>
            ) : <p style={{ margin: "14px 0 0", fontSize: 12, color: MUTED_FG }}>This booking is final.</p>}
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!confirmCancel} onClose={function () { if (!saving) setConfirmCancel(null); }} title="Cancel this booking?"
        footer={<>
          <Button variant="ghost" onClick={function () { setConfirmCancel(null); }} disabled={saving}>Keep booking</Button>
          <Button variant="danger" onClick={function () { changeStatus(confirmCancel, "cancelled"); }} disabled={saving}>{saving ? "Cancelling…" : "Cancel booking"}</Button>
        </>}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: FOREGROUND }}>
          The time slot is released and the booking stays in the history as cancelled. This can't be undone.
        </p>
        <ErrorLine>{err}</ErrorLine>
      </Modal>
    </div>
  );
}
