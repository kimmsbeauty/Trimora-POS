// src/pages/pet/overviewData.js
//
// Pure helpers for the Overview dashboard (no network, no React). Every number
// here is computed from records the database returned; nothing is estimated,
// trended or invented. Reuses the rules the other Pet screens already use
// (booking statuses, invoice outstanding/overdue, vaccination status, stock
// level, boarding dates) so Overview can never disagree with them.

import {
  STATUS_LABELS, STATUS_TONES, STATUS_ACTIONS, NEXT_STATUSES, isActive, bookingsOnDay, dateKey, startOfDay, addDays, formatTime,
} from "./bookingData";
import { outstanding, isOverdue } from "./invoiceData";
import { daysBetween, todayKey } from "./boardingData";
import { vaccinationStatus } from "./petData";
import { stockLevel } from "./supplyData";

export var FEED_DAYS = 7;
export var FEED_LIMIT = 8;
export var BOARDING_LIMIT = 6;
// A booked appointment this many minutes past its start time is flagged as "not checked in yet".
export var LATE_MINUTES = 15;
// Checkouts within this many days are called out as "soon".
export var CHECKOUT_SOON_DAYS = 2;

export function greetingFor(now) {
  var h = (now || new Date()).getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function longDate(now) {
  return (now || new Date()).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function sum(list, pick) { return (list || []).reduce(function (t, x) { return t + (Number(pick(x)) || 0); }, 0); }

// ---- summary cards ----

// Appointments scheduled for today. Cancelled and no-show bookings freed their
// slot (same rule as the calendar), so they are not counted.
export function todaysBookings(bookings, now) {
  return bookingsOnDay(bookings, now || new Date());
}
export function appointmentsToday(bookings, now) {
  return todaysBookings(bookings, now).filter(isActive).length;
}

// Pets currently checked in for boarding (stay status "occupied").
export function petsBoarding(stays) {
  return (stays || []).filter(function (s) { return s.status === "occupied"; }).length;
}

// Money actually recorded today: pet_payments rows whose paid_at falls on today's
// local date. Voided invoices cannot hold payments, so nothing needs excluding.
export function revenueToday(payments, now) {
  var key = dateKey(now || new Date());
  var rows = (payments || []).filter(function (p) { return dateKey(new Date(p.paid_at)) === key; });
  return { total: sum(rows, function (p) { return p.amount; }), count: rows.length };
}

// Unpaid balance across live invoices, and how many invoices still owe something.
export function outstandingInvoices(invoices) {
  var owing = (invoices || []).filter(function (i) { return outstanding(i) > 0; });
  return { total: sum(owing, outstanding), count: owing.length };
}

// ---- today's schedule ----

// Rows for the schedule list. Only the forward moves the database allows are offered
// as quick actions (cancel / no-show stay in the calendar, where they are confirmed).
export function scheduleRows(bookings, maps, now) {
  return todaysBookings(bookings, now).map(function (b) {
    var pet = maps.pets[b.pet_id]; var customer = maps.customers[b.customer_id]; var staff = b.staff_id ? maps.staff[b.staff_id] : null;
    var services = (b.pet_booking_services || []).map(function (l) { return l.service_name; }).filter(Boolean);
    var actions = (NEXT_STATUSES[b.status] || []).filter(function (s) { return s !== "cancelled" && s !== "no-show"; });
    return {
      id: b.id, time: formatTime(b.starts_at), status: b.status, label: STATUS_LABELS[b.status] || b.status, tone: STATUS_TONES[b.status] || "neutral",
      pet: pet ? pet.name : "Unknown pet", customer: customer ? customer.name : "Unknown customer",
      services: services.length ? services.join(", ") : "No service listed", staff: staff ? staff.name : "Unassigned",
      actions: actions.map(function (s) { return { status: s, label: STATUS_ACTIONS[s] || STATUS_LABELS[s] }; }),
      faded: !isActive(b),
    };
  });
}

// ---- boarding ----

// Pets currently checked in, earliest check-out first. Flags: due today, overdue (past the
// expected date and still here), or leaving soon.
export function boardingRows(stays, maps, today) {
  var t = today || todayKey();
  return (stays || []).filter(function (s) { return s.status === "occupied"; })
    .sort(function (a, b) { return a.check_out_on < b.check_out_on ? -1 : a.check_out_on > b.check_out_on ? 1 : 0; })
    .map(function (s) {
      var pet = maps.pets[s.pet_id]; var customer = maps.customers[s.customer_id]; var kennel = maps.kennels[s.kennel_id];
      var left = daysBetween(t, s.check_out_on);
      return {
        id: s.id, pet: pet ? pet.name : "Unknown pet", owner: customer ? customer.name : "Unknown owner", kennel: kennel ? kennel.name : "No kennel",
        checkIn: s.check_in_on, checkOut: s.check_out_on, dueToday: left === 0, overdue: left < 0, soon: left > 0 && left <= CHECKOUT_SOON_DAYS,
      };
    });
}

// ---- needs attention ----

function minutesPast(iso, now) { return Math.floor(((now || new Date()).getTime() - new Date(iso).getTime()) / 60000); }

// Each item: { key, tone, title, detail, target } where target is a Pet nav key.
// Only items with something to report are returned, so an empty array means all clear.
export function attentionItems(input) {
  var now = input.now || new Date(); var today = todayKey(now); var maps = input.maps; var out = [];

  var overdue = (input.invoices || []).filter(function (i) { return isOverdue(i, now); });
  if (overdue.length) {
    out.push({ key: "overdue", tone: "danger", target: "invoices", count: overdue.length,
      title: overdue.length + (overdue.length === 1 ? " overdue invoice" : " overdue invoices"),
      amount: sum(overdue, outstanding) });
  }

  var ready = (input.bookings || []).filter(function (b) { return b.status === "ready"; });
  var leaving = (input.stays || []).filter(function (s) { return s.status === "occupied" && s.check_out_on <= today; });
  var collect = ready.length + leaving.length;
  if (collect) {
    var names = ready.map(function (b) { return maps.pets[b.pet_id] ? maps.pets[b.pet_id].name : null; })
      .concat(leaving.map(function (s) { return maps.pets[s.pet_id] ? maps.pets[s.pet_id].name : null; })).filter(Boolean);
    out.push({ key: "collection", tone: "violet", target: ready.length ? "calendar" : "boarding", count: collect,
      title: collect + (collect === 1 ? " pet due for collection" : " pets due for collection"), names: names.slice(0, 3) });
  }

  var vaccPets = {}; var dueSoon = 0; var lapsed = 0;
  (input.vaccinations || []).forEach(function (v) {
    var s = vaccinationStatus(v.next_due_on, today);
    if (s === "overdue") { lapsed += 1; vaccPets[v.pet_id] = true; }
    else if (s === "due-soon") { dueSoon += 1; vaccPets[v.pet_id] = true; }
  });
  if (lapsed || dueSoon) {
    var vn = Object.keys(vaccPets).map(function (id) { return maps.pets[id] ? maps.pets[id].name : null; }).filter(Boolean);
    out.push({ key: "vaccinations", tone: lapsed ? "danger" : "warning", target: "pets", count: lapsed + dueSoon, lapsed: lapsed, dueSoon: dueSoon,
      title: "Vaccinations: " + (lapsed ? lapsed + " overdue" : "") + (lapsed && dueSoon ? ", " : "") + (dueSoon ? dueSoon + " due soon" : ""), names: vn.slice(0, 3) });
  }

  var low = 0; var gone = 0;
  (input.items || []).filter(function (i) { return i.active !== false; }).forEach(function (i) {
    var l = stockLevel(i); if (l === "out") gone += 1; else if (l === "low") low += 1;
  });
  if (low || gone) {
    out.push({ key: "stock", tone: gone ? "danger" : "warning", target: "supplies", count: low + gone,
      title: "Low stock: " + (gone ? gone + " out" : "") + (gone && low ? ", " : "") + (low ? low + " running low" : "") });
  }

  // Booking issues: booked appointments well past their start time today, and anything from an earlier
  // day that was never completed, cancelled or marked no-show.
  var late = todaysBookings(input.bookings, now).filter(function (b) { return b.status === "booked" && minutesPast(b.starts_at, now) > LATE_MINUTES; });
  var stale = (input.bookings || []).filter(function (b) {
    return dateKey(new Date(b.starts_at)) < dateKey(now) && ["booked", "checked-in", "in-progress"].indexOf(b.status) !== -1;
  });
  if (late.length || stale.length) {
    var parts = [];
    if (late.length) parts.push(late.length + " not checked in yet");
    if (stale.length) parts.push(stale.length + " from earlier days still open");
    out.push({ key: "bookings", tone: "warning", target: "calendar", count: late.length + stale.length, title: "Booking issues: " + parts.join(", ") });
  }
  return out;
}

// ---- recent activity ----
// Built only from real timestamps on real records. Low-stock alerts are shown under Needs attention,
// not here, because stock levels are a state rather than a dated event.

function within(iso, now) { return !!iso && new Date(iso).getTime() >= startOfDay(addDays(now, -FEED_DAYS)).getTime(); }

export function activityFeed(input) {
  var now = input.now || new Date(); var maps = input.maps; var money = input.fmt || function (n) { return String(n); };
  var events = [];
  function petName(id) { return maps.pets[id] ? maps.pets[id].name : "a pet"; }

  (input.recentBookings || []).forEach(function (b) {
    var name = petName(b.pet_id);
    var created = new Date(b.created_at).getTime(); var updated = new Date(b.updated_at).getTime();
    if (within(b.created_at, now)) events.push({ id: "bc-" + b.id, at: b.created_at, kind: "booking", text: "Booking created for " + name, target: "calendar" });
    if (updated - created > 60000 && within(b.updated_at, now)) {
      if (b.status === "completed") events.push({ id: "bd-" + b.id, at: b.updated_at, kind: "grooming", text: "Service completed for " + name, target: "calendar" });
      else events.push({ id: "bu-" + b.id, at: b.updated_at, kind: "booking", text: "Booking for " + name + " is now " + (STATUS_LABELS[b.status] || b.status), target: "calendar" });
    }
  });
  (input.recentStays || []).forEach(function (s) {
    var name = petName(s.pet_id);
    if (within(s.checked_in_at, now)) events.push({ id: "si-" + s.id, at: s.checked_in_at, kind: "boarding", text: name + " checked in for boarding", target: "boarding" });
    if (within(s.checked_out_at, now)) events.push({ id: "so-" + s.id, at: s.checked_out_at, kind: "boarding", text: name + " checked out of boarding", target: "boarding" });
  });
  (input.recentInvoices || []).forEach(function (i) {
    if (within(i.issued_at, now)) events.push({ id: "iv-" + i.id, at: i.issued_at, kind: "invoice", text: "Invoice " + i.invoice_number + " created (" + money(i.total) + ")", target: "invoices" });
  });
  (input.payments || []).forEach(function (p) {
    if (within(p.paid_at, now)) events.push({ id: "pm-" + p.id, at: p.paid_at, kind: "payment", text: "Payment of " + money(p.amount) + " recorded", target: "invoices" });
  });
  (input.recentPets || []).forEach(function (p) {
    if (within(p.created_at, now)) events.push({ id: "pt-" + p.id, at: p.created_at, kind: "customer", text: "New pet registered: " + p.name, target: "pets" });
  });
  (input.recentProfiles || []).forEach(function (c) {
    var cust = maps.customers[c.customer_id];
    if (within(c.created_at, now)) events.push({ id: "cu-" + c.customer_id, at: c.created_at, kind: "customer", text: "New customer registered" + (cust ? ": " + cust.name : ""), target: "customers" });
  });
  return events.sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, FEED_LIMIT);
}

// "5 min ago", "2 h ago", "Yesterday 14:05", "Mon 12 Oct". Local time.
export function relativeTime(iso, now) {
  var n = now || new Date(); var d = new Date(iso);
  var mins = Math.floor((n.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + " min ago";
  if (dateKey(d) === dateKey(n)) return Math.floor(mins / 60) + " h ago";
  if (dateKey(d) === dateKey(addDays(n, -1))) return "Yesterday " + formatTime(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// The date range the loader needs (ISO strings), kept here so tests can check it.
export function loadWindow(now) {
  var n = now || new Date(); var dayStart = startOfDay(n);
  return {
    todayKey: todayKey(n),
    dayStart: dayStart.toISOString(),
    dayEnd: addDays(dayStart, 1).toISOString(),
    weekAgo: startOfDay(addDays(n, -FEED_DAYS)).toISOString(),
    issuesFrom: startOfDay(addDays(n, -7)).toISOString(),
  };
}
