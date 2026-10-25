// src/pages/pet/OverviewPage.jsx
//
// Overview dashboard for Trimora Pet. Everything shown comes from real records
// (see overviewLoader.js / overviewData.js); nothing is estimated or invented.
// Status changes go through the same database functions the Calendar and Boarding
// screens use (pet_set_booking_status, pet_set_stay_status), so the database stays
// the authority on which moves are allowed.
//
// onNavigate(key, options) switches section in PetApp; links and shortcuts only
// appear for sections the signed-in role can see (same nav model as the sidebar).
import React, { useEffect, useMemo, useState } from "react";
import { dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { CARD, BORDER, MUTED, MUTED_FG, FOREGROUND, ACCENT, ACCENT_FG, PRIMARY, FONT_HEADING } from "./theme";
import PetIcon from "./PetIcon";
import { visiblePetNav, petInitials } from "./petNav";
import { bookingErrorMessage } from "./bookingData";
import { STAY_LABELS, STAY_TONES, formatDay, boardingErrorMessage } from "./boardingData";
import { PageHeader, Card, Button, Badge, EmptyState, ErrorLine } from "./ui";
import { loadOverview } from "./overviewLoader";
import {
  greetingFor, longDate, appointmentsToday, petsBoarding, revenueToday, outstandingInvoices, scheduleRows, boardingRows,
  attentionItems, activityFeed, relativeTime, BOARDING_LIMIT,
} from "./overviewData";

var CSS = [
  ".pet-ov-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 16px; }",
  ".pet-ov-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; margin-bottom: 16px; }",
  ".pet-ov-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 16px; }",
  ".pet-ov-card-btn, .pet-ov-tile, .pet-ov-link, .pet-ov-feed-btn { font-family: inherit; cursor: pointer; }",
  ".pet-ov-card-btn:hover, .pet-ov-tile:hover { border-color: " + PRIMARY + "; }",
  ".pet-ov-card-btn:focus-visible, .pet-ov-tile:focus-visible, .pet-ov-link:focus-visible, .pet-ov-feed-btn:focus-visible { outline: 2px solid " + PRIMARY + "; outline-offset: 2px; }",
  ".pet-ov-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding: 12px 16px; min-width: 0; }",
  ".pet-ov-row + .pet-ov-row { border-top: 1px solid " + BORDER + "; }",
  ".pet-ov-grow { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }",
  "@media (min-width: 1024px) { .pet-ov-two { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); } }",
].join("\n");

// Confirmation wording after a quick status change.
var DONE = { "checked-in": "checked in", "in-progress": "started", ready: "marked ready for collection", completed: "completed" };

function Avatar({ name }) {
  return (
    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", background: ACCENT, color: ACCENT_FG, display: "inline-flex",
      alignItems: "center", justifyContent: "center", fontFamily: FONT_HEADING, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
      {petInitials(name)}
    </span>
  );
}

function Section({ title, linkLabel, onLink, children }) {
  return (
    <Card style={{ overflow: "hidden", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 16px", borderBottom: "1px solid " + BORDER }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
        {onLink ? (
          <button type="button" className="pet-ov-link" onClick={onLink}
            style={{ background: "none", border: 0, padding: 4, color: ACCENT_FG, fontWeight: 700, fontSize: 12, textDecoration: "underline" }}>{linkLabel}</button>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function SummaryCard({ label, value, hint, onClick }) {
  var body = (
    <>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: MUTED_FG }}>{label}</span>
      <span style={{ display: "block", fontFamily: FONT_HEADING, fontSize: 28, fontWeight: 600, margin: "6px 0 2px", color: FOREGROUND }}>{value}</span>
      <span style={{ display: "block", fontSize: 12, color: MUTED_FG }}>{hint}</span>
    </>
  );
  var style = { textAlign: "left", background: CARD, border: "1px solid " + BORDER, borderRadius: 16, padding: 16, minWidth: 0, width: "100%", boxSizing: "border-box", overflowWrap: "anywhere" };
  if (!onClick) return <div style={style}>{body}</div>;
  return <button type="button" className="pet-ov-card-btn" onClick={onClick} style={style}>{body}</button>;
}

function Tile({ icon, label, onClick }) {
  return (
    <button type="button" className="pet-ov-tile" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: CARD,
      border: "1px solid " + BORDER, borderRadius: 12, padding: "10px 12px", color: FOREGROUND, fontSize: 13, fontWeight: 700, minWidth: 0 }}>
      <span style={{ display: "inline-flex", color: ACCENT_FG, background: ACCENT, borderRadius: 8, padding: 6, flexShrink: 0 }}><PetIcon name={icon} size={16} /></span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{label}</span>
    </button>
  );
}

export default function OverviewPage({ businessName, isAdmin, onNavigate }) {
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var statusState = useState("loading"); var loadStatus = statusState[0]; var setLoadStatus = statusState[1];
  var nowState = useState(new Date()); var now = nowState[0]; var setNow = nowState[1];
  var tickState = useState(0); var tick = tickState[0]; var setTick = tickState[1];
  var busyState = useState(""); var busy = busyState[0]; var setBusy = busyState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var okState = useState(""); var notice = okState[0]; var setNotice = okState[1];

  useEffect(function () {
    var cancelled = false;
    var at = new Date();
    setLoadStatus("loading");
    loadOverview(at).then(function (res) {
      if (cancelled) return;
      if (!res.ok) { setLoadStatus("error"); return; }
      setNow(at); setData(res); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [tick]);

  var allowed = useMemo(function () {
    var keys = {}; visiblePetNav(isAdmin).forEach(function (n) { keys[n.key] = true; }); return keys;
  }, [isAdmin]);
  function go(key, opts) { if (allowed[key] && onNavigate) onNavigate(key, opts); }

  var maps = useMemo(function () {
    var m = { customers: {}, pets: {}, staff: {}, kennels: {} };
    if (data) {
      data.customers.forEach(function (c) { m.customers[c.id] = c; });
      data.pets.forEach(function (p) { m.pets[p.id] = p; });
      data.staff.forEach(function (s) { m.staff[s.id] = s; });
      data.kennels.forEach(function (k) { m.kennels[k.id] = k; });
    }
    return m;
  }, [data]);

  var greeting = greetingFor(now);
  var header = (
    <PageHeader title={greeting} subtitle={"Here's what's happening at " + (businessName || "your business") + " today. " + longDate(now)}
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {allowed.calendar ? <Button onClick={function () { go("calendar", { view: "day", startNew: true }); }}>New Booking</Button> : null}
          {allowed.customers ? <Button variant="outline" onClick={function () { go("customers"); }}>Add Customer / Pet</Button> : null}
        </div>
      } />
  );

  if (loadStatus === "loading" && !data) {
    return <div><style>{CSS}</style><PageHeader title={greeting} subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading your overview…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <style>{CSS}</style>
        <PageHeader title={greeting} />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load the overview" description="Check your connection and try again."
            action={<Button onClick={function () { setTick(tick + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var today = data.today;
  var rows = scheduleRows(data.bookings, maps, now);
  var stays = boardingRows(data.stays, maps, today);
  var attention = attentionItems({ now: now, maps: maps, invoices: data.invoices, bookings: data.bookings, stays: data.stays, vaccinations: data.vaccinations, items: data.items });
  var feed = activityFeed({ now: now, maps: maps, fmt: fmt, recentBookings: data.recentBookings, recentStays: data.recentStays, recentInvoices: data.recentInvoices,
    payments: data.payments, recentPets: data.pets, recentProfiles: data.recentProfiles });
  var owed = outstandingInvoices(data.invoices);
  var earned = revenueToday(data.payments, now);
  var attentionPartial = data.failed.vaccinations || data.failed.items;
  var feedPartial = data.failed.recentBookings || data.failed.recentStays || data.failed.recentInvoices || data.failed.recentProfiles;

  async function runStatus(kind, id, status, fnName, args, message, friendly) {
    if (busy) return;
    setBusy(kind + id); setErr(""); setNotice("");
    var res = await dbRpcAuth(fnName, args);
    setBusy("");
    if (res && res.error) { setErr(friendly(res.error)); return; }
    setNotice(message);
    setTick(tick + 1);
  }
  function moveBooking(r, a) {
    runStatus("b", r.id, a.status, "pet_set_booking_status", { p_id: r.id, p_status: a.status },
      r.pet + " " + (DONE[a.status] || "updated") + ".", bookingErrorMessage);
  }
  function checkOut(s) {
    runStatus("s", s.id, "checked-out", "pet_set_stay_status", { p_id: s.id, p_status: "checked-out" }, s.pet + " checked out of boarding.", boardingErrorMessage);
  }

  var tiles = [
    { key: "calendar", icon: "calendar", label: "New Booking", opts: { view: "day", startNew: true } },
    { key: "customers", icon: "customers", label: "Register Customer & Pet" },
    { key: "checkout", icon: "checkout", label: "Create Invoice" },
    { key: "invoices", icon: "invoices", label: "Record Payment", opts: { status: "outstanding" } },
    { key: "boarding", icon: "boarding", label: "Check In Boarding Pet" },
    { key: "supplies", icon: "supplies", label: "Add Inventory Item" },
  ].filter(function (t) { return allowed[t.key]; });

  return (
    <div style={{ minWidth: 0 }}>
      <style>{CSS}</style>
      {header}

      <div className="pet-ov-cards">
        <SummaryCard label="Today's Appointments" value={appointmentsToday(data.bookings, now)}
          hint={rows.length === 0 ? "Nothing booked today" : "Open today's bookings"} onClick={allowed.calendar ? function () { go("calendar", { view: "day" }); } : null} />
        <SummaryCard label="Pets Boarding" value={petsBoarding(data.stays)}
          hint={petsBoarding(data.stays) === 0 ? "No pets checked in" : "Checked in right now"} onClick={allowed.boarding ? function () { go("boarding"); } : null} />
        <SummaryCard label="Revenue Collected Today" value={fmt(earned.total)}
          hint={earned.count === 0 ? "No payments recorded yet" : earned.count + (earned.count === 1 ? " payment" : " payments")} onClick={allowed.invoices ? function () { go("invoices"); } : null} />
        <SummaryCard label="Outstanding Invoices" value={fmt(owed.total)}
          hint={owed.count === 0 ? "Nothing owing" : owed.count + (owed.count === 1 ? " invoice unpaid" : " invoices unpaid")} onClick={allowed.invoices ? function () { go("invoices", { status: "outstanding" }); } : null} />
      </div>

      {err ? <ErrorLine>{err}</ErrorLine> : null}
      {notice ? <p role="status" style={{ margin: "0 0 12px", color: ACCENT_FG, fontSize: 12, fontWeight: 700 }}>{notice}</p> : null}

      {tiles.length > 0 ? (
        <div className="pet-ov-tiles" role="group" aria-label="Quick actions">
          {tiles.map(function (t) { return <Tile key={t.label} icon={t.icon} label={t.label} onClick={function () { go(t.key, t.opts); }} />; })}
        </div>
      ) : null}

      <div className="pet-ov-two">
        <Section title="Today's schedule" linkLabel={allowed.calendar ? "View full calendar" : null} onLink={allowed.calendar ? function () { go("calendar"); } : null}>
          {rows.length === 0 ? (
            <EmptyState title="No appointments today" description="New bookings for today will show up here."
              action={allowed.calendar ? <Button onClick={function () { go("calendar", { view: "day", startNew: true }); }}>New Booking</Button> : null} />
          ) : rows.map(function (r) {
            return (
              <div key={r.id} className="pet-ov-row" style={{ opacity: r.faded ? 0.6 : 1 }}>
                <span style={{ width: 48, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{r.time}</span>
                <Avatar name={r.pet} />
                <div className="pet-ov-grow">
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.pet} <span style={{ fontWeight: 500, color: MUTED_FG }}>· {r.customer}</span></div>
                  <div style={{ fontSize: 12, color: MUTED_FG }}>{r.services} · {r.staff}</div>
                </div>
                <Badge tone={r.tone}>{r.label}</Badge>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {r.actions.map(function (a) {
                    return <Button key={a.status} size="sm" disabled={!!busy} ariaLabel={a.label + " " + r.pet} onClick={function () { moveBooking(r, a); }}>{a.label}</Button>;
                  })}
                  {allowed.calendar ? <Button size="sm" variant="outline" ariaLabel={"View booking for " + r.pet} onClick={function () { go("calendar", { view: "day" }); }}>View booking</Button> : null}
                </div>
              </div>
            );
          })}
        </Section>

        <Section title="Needs attention">
          {attention.length === 0 ? (
            <EmptyState title="All clear" description={attentionPartial ? "Nothing needs attention, but some alerts couldn't be loaded." : "Nothing needs your attention right now."} />
          ) : attention.map(function (a) {
            return (
              <div key={a.key} className="pet-ov-row">
                <div className="pet-ov-grow">
                  <Badge tone={a.tone}>{a.title}</Badge>
                  {a.amount ? <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 4 }}>{fmt(a.amount)} owing</div> : null}
                  {a.names && a.names.length ? <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 4 }}>{a.names.join(", ")}</div> : null}
                </div>
                {allowed[a.target] ? <Button size="sm" variant="outline" ariaLabel={"View: " + a.title} onClick={function () { go(a.target, a.key === "overdue" ? { status: "overdue" } : undefined); }}>View</Button> : null}
              </div>
            );
          })}
          {attentionPartial && attention.length > 0 ? <p style={{ margin: 0, padding: "10px 16px", fontSize: 12, color: MUTED_FG }}>Some alerts couldn't be loaded. Refresh to try again.</p> : null}
        </Section>
      </div>

      <div className="pet-ov-two">
        <Section title="Boarding" linkLabel={allowed.boarding ? "View boarding" : null} onLink={allowed.boarding ? function () { go("boarding"); } : null}>
          {stays.length === 0 ? (
            <EmptyState title="No pets boarding" description="Pets that are checked in for boarding will show up here." />
          ) : stays.slice(0, BOARDING_LIMIT).map(function (s) {
            return (
              <div key={s.id} className="pet-ov-row">
                <Avatar name={s.pet} />
                <div className="pet-ov-grow">
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.pet} <span style={{ fontWeight: 500, color: MUTED_FG }}>· {s.owner}</span></div>
                  <div style={{ fontSize: 12, color: MUTED_FG }}>{s.kennel} · In {formatDay(s.checkIn)} · Out {formatDay(s.checkOut)}</div>
                </div>
                <Badge tone={STAY_TONES.occupied}>{STAY_LABELS.occupied}</Badge>
                {s.overdue ? <Badge tone="danger">Check-out overdue</Badge> : s.dueToday ? <Badge tone="warning">Check-out today</Badge> : s.soon ? <Badge tone="info">Leaving soon</Badge> : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Button size="sm" disabled={!!busy} ariaLabel={"Check out " + s.pet} onClick={function () { checkOut(s); }}>Check out</Button>
                  {allowed.boarding ? <Button size="sm" variant="outline" ariaLabel={"View details for " + s.pet} onClick={function () { go("boarding"); }}>View details</Button> : null}
                </div>
              </div>
            );
          })}
          {stays.length > BOARDING_LIMIT ? <p style={{ margin: 0, padding: "10px 16px", fontSize: 12, color: MUTED_FG, borderTop: "1px solid " + BORDER }}>+{stays.length - BOARDING_LIMIT} more on the boarding page.</p> : null}
        </Section>

        <Section title="Recent activity">
          {feedPartial && feed.length === 0 ? (
            <EmptyState title="Couldn't load recent activity" description="Refresh to try again." action={<Button onClick={function () { setTick(tick + 1); }}>Try again</Button>} />
          ) : feed.length === 0 ? (
            <EmptyState title="No recent activity" description="Bookings, payments, invoices and check-ins from the last 7 days will show up here." />
          ) : feed.map(function (e) {
            var inner = (
              <>
                <span aria-hidden="true" style={{ display: "inline-flex", color: ACCENT_FG, background: MUTED, borderRadius: 8, padding: 6, flexShrink: 0 }}>
                  <PetIcon name={e.kind === "payment" || e.kind === "invoice" ? "invoices" : e.kind === "boarding" ? "boarding" : e.kind === "grooming" ? "grooming" : e.kind === "customer" ? "customers" : "calendar"} size={14} />
                </span>
                <span className="pet-ov-grow" style={{ fontSize: 13 }}>{e.text}</span>
                <span style={{ fontSize: 11, color: MUTED_FG, flexShrink: 0 }}>{relativeTime(e.at, now)}</span>
              </>
            );
            return allowed[e.target] ? (
              <button key={e.id} type="button" className="pet-ov-row pet-ov-feed-btn" onClick={function () { go(e.target); }}
                style={{ width: "100%", background: "transparent", border: 0, textAlign: "left", color: FOREGROUND, boxSizing: "border-box" }}>{inner}</button>
            ) : <div key={e.id} className="pet-ov-row">{inner}</div>;
          })}
        </Section>
      </div>
    </div>
  );
}
