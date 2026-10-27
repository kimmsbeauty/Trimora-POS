// src/pages/pet/PetPublicBooking.jsx
//
// The public page at /:slug/pet/book (inside SalonGate mode="public"). A pet owner picks
// grooming services and a free time and sends a REQUEST. It is not an instant booking:
// the business confirms it. Everything here goes through three anonymous database
// functions that return only opening hours, the service list, free start times and a
// reference code (migration 108); no customer, pet or staff data is ever read.
import React, { useEffect, useMemo, useState } from "react";
import { dbRpc } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND, BACKGROUND, CARD } from "./theme";
import PetLetterhead from "./PetLetterhead";
import { publicBrand } from "./publicBrand";
import { Card, Button, Field, ErrorLine, inputStyle } from "./ui";
import { whatsappUrl } from "./reminderData";
import { getValidAccessToken } from "../../lib/deviceAuth";
import {
  SPECIES, publicErrorMessage, isSlotError, validateRequestForm, selectedTotals, groupByCategory, durationLabel,
  dateInZone, addDays, slotTime, slotDateTime, hoursSummary,
} from "./publicBookingData";

function Shell({ salon, children }) {
  var brand = publicBrand(salon);
  return (
    <div style={{ minHeight: "100vh", background: brand.bg, color: brand.onBg, padding: "20px 12px 48px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: brand.branded ? "2px solid " + brand.primary : "none" }}>
          <PetLetterhead salon={salon} color={brand.accentOnBg} mutedColor={brand.onBgMuted} />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PetPublicBooking() {
  var salon = useSalon() || {};
  var brand = publicBrand(salon);
  var infoState = useState(null); var info = infoState[0]; var setInfo = infoState[1];
  var loadState = useState("loading"); var load = loadState[0]; var setLoad = loadState[1];
  var svcState = useState([]); var serviceIds = svcState[0]; var setServiceIds = svcState[1];
  var dateState = useState(""); var date = dateState[0]; var setDate = dateState[1];
  var slotsState = useState(null); var slots = slotsState[0]; var setSlots = slotsState[1]; // null = not loaded
  var slotLoadState = useState("idle"); var slotLoad = slotLoadState[0]; var setSlotLoad = slotLoadState[1];
  var startState = useState(""); var start = startState[0]; var setStart = startState[1];
  var formState = useState({ name: "", phone: "", pet: "", species: "Dog", breed: "", notes: "", consent: false, website: "" });
  var form = formState[0]; var setForm = formState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var doneState = useState(null); var done = doneState[0]; var setDone = doneState[1];
  var staffState = useState(false); var staffHere = staffState[0]; var setStaffHere = staffState[1];

  useEffect(function () {
    if (!salon.id) return undefined;
    var cancelled = false;
    setLoad("loading");
    dbRpc("pet_public_booking_info", { p_salon_id: salon.id }).then(function (r) {
      if (cancelled) return;
      if (!r || typeof r !== "object") { setLoad("error"); return; }
      if (!r.enabled || salon.business_type !== "pet") { setLoad("closed"); return; }
      setInfo(r); setLoad("ready");
    });
    return function () { cancelled = true; };
  }, [salon.id, salon.business_type]);

  // When the page is closed, a signed-in device (staff) gets a pointer to the switch that opens it.
  useEffect(function () {
    if (load !== "closed") return undefined;
    var cancelled = false;
    try {
      Promise.resolve(getValidAccessToken()).then(function (t) { if (!cancelled) setStaffHere(!!t); }, function () {});
    } catch (e) { /* no device session: visitors see the normal closed page */ }
    return function () { cancelled = true; };
  }, [load]);

  var tz = info ? info.timezone : "Africa/Nairobi";
  var today = info ? dateInZone(new Date(), tz) : "";
  var totals = useMemo(function () { return info ? selectedTotals(info.services, serviceIds) : { minutes: 0, price: 0 }; }, [info, serviceIds]);

  // free start times for the chosen day and services
  function loadSlots(forDate, ids) {
    if (!forDate || ids.length === 0 || !salon.id) { setSlots(null); setSlotLoad("idle"); return undefined; }
    var cancelled = false;
    setSlotLoad("loading"); setStart("");
    dbRpc("pet_public_slots", { p_salon_id: salon.id, p_date: forDate, p_service_ids: ids }).then(function (r) {
      if (cancelled) return;
      if (!r || r.ok !== true) { setSlots(null); setSlotLoad("error"); return; }
      setSlots(r.slots || []); setSlotLoad("ready");
    });
    return function () { cancelled = true; };
  }
  useEffect(function () { return loadSlots(date, serviceIds); }, [date, serviceIds.join(","), salon.id]);

  function toggleService(id) {
    setErr("");
    setServiceIds(serviceIds.indexOf(id) === -1 ? serviceIds.concat([id]).slice(0, 5) : serviceIds.filter(function (x) { return x !== id; }));
  }
  function setF(k, v) { var o = {}; o[k] = v; setForm(Object.assign({}, form, o)); setErr(""); }

  async function submit() {
    if (busy) return;
    var problem = validateRequestForm({ serviceIds: serviceIds, start: start, name: form.name, phone: form.phone, pet: form.pet, species: form.species, breed: form.breed, notes: form.notes, consent: form.consent });
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr("");
    var r = await dbRpc("pet_public_submit_request", {
      p_salon_id: salon.id, p_service_ids: serviceIds, p_starts_at: start, p_customer_name: form.name.trim(), p_phone: form.phone.trim(),
      p_pet_name: form.pet.trim(), p_species: form.species, p_breed: form.breed.trim() || null, p_notes: form.notes.trim() || null,
      p_consent: form.consent, p_website: form.website,
    });
    setBusy(false);
    if (!r || typeof r !== "object") { setErr("We couldn't send your request. Please check your connection and try again."); return; }
    if (r.ok !== true) {
      setErr(publicErrorMessage(r.error));
      if (isSlotError(r.error)) loadSlots(date, serviceIds);
      return;
    }
    setDone({ reference: r.reference, when: slotDateTime(start, tz), services: info.services.filter(function (s) { return serviceIds.indexOf(s.id) !== -1; }).map(function (s) { return s.name; }).join(", ") });
  }

  if (!salon.id || load === "loading") return <Shell salon={salon}><p style={{ color: brand.onBgMuted, fontSize: 14 }}>Loading…</p></Shell>;
  if (load === "error") {
    return <Shell salon={salon}><Card style={{ padding: 20 }}><div style={{ fontWeight: 700, marginBottom: 6 }}>We couldn't load the booking page</div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: MUTED_FG }}>Please check your connection and try again.</p><Button onClick={function () { setLoad("loading"); window.location.reload(); }}>Try again</Button></Card></Shell>;
  }
  var phoneLink = salon.contact_phone ? whatsappUrl(salon.contact_phone, "") : null;
  if (load === "closed") {
    return <Shell salon={salon}><Card style={{ padding: 20 }}><div style={{ fontWeight: 700, marginBottom: 6 }}>Online booking isn't available right now</div>
      <p style={{ margin: 0, fontSize: 13, color: MUTED_FG, lineHeight: 1.5 }}>Please contact {salon.name || "us"} directly to book{salon.contact_phone ? ": " + salon.contact_phone : ""}.</p>
      {phoneLink ? <p style={{ margin: "10px 0 0" }}><a href={phoneLink} style={{ color: FOREGROUND, fontWeight: 700 }}>Message us on WhatsApp</a></p> : null}
      {staffHere ? <p style={{ margin: "14px 0 0", paddingTop: 12, borderTop: "1px solid " + BORDER, fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>
        Staff: online booking isn't switched on yet. Open the <a href={"/" + (salon.slug || "") + "/pet"} style={{ color: FOREGROUND, fontWeight: 700 }}>Pet app</a>, go to Settings and tick "Accept online booking requests", and add the business phone number so customers can reach you.</p> : null}</Card></Shell>;
  }
  if (done) {
    // Same two WhatsApp hand-offs the salon booking page gives after booking:
    // a message to the business from the customer, and a booking-details note.
    var bizName = salon.name || "us";
    var petLine = form.pet.trim() + " (" + form.species + (form.breed.trim() ? ", " + form.breed.trim() : "") + ")";
    var customerWaLink = salon.contact_phone ? whatsappUrl(salon.contact_phone,
      "🐾 " + bizName + "\n\nHi! I've just sent a booking request.\n\nReference: " + done.reference + "\nPet: " + petLine +
      "\nServices: " + done.services + "\nRequested: " + done.when + "\n\nPlease confirm when you can. Thank you!") : null;
    var ownerWaLink = salon.contact_phone ? whatsappUrl(salon.contact_phone,
      "📅 New Booking Request — " + bizName + "\n\nClient: " + form.name.trim() + " (" + form.phone.trim() + ")\nPet: " + petLine +
      "\nServices: " + done.services + "\nRequested: " + done.when + "\nReference: " + done.reference +
      (form.notes.trim() ? "\nNotes: " + form.notes.trim() : "")) : null;
    return (
      <Shell salon={salon}>
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Request sent</div>
          <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5 }}>Thank you, {form.name.trim().split(/\s+/)[0]}. <strong>This is a request, not a confirmed booking.</strong> {salon.name || "We"} will contact you on {form.phone.trim()} to confirm.</p>
          <div style={{ background: MUTED, borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.6 }}>
            <div><span style={{ color: MUTED_FG }}>Reference:</span> <strong>{done.reference}</strong></div>
            <div><span style={{ color: MUTED_FG }}>Requested:</span> {done.when}</div>
            <div><span style={{ color: MUTED_FG }}>For:</span> {form.pet.trim()} · {done.services}</div>
          </div>
          {customerWaLink ? <a href={customerWaLink} target="_blank" rel="noreferrer"
            style={{ display: "block", textAlign: "center", background: "#25D366", color: "#fff", borderRadius: 12, padding: "13px 0", fontWeight: 800, fontSize: 15, textDecoration: "none", marginTop: 14 }}>📲 Message us on WhatsApp</a> : null}
          {ownerWaLink ? <a href={ownerWaLink} target="_blank" rel="noreferrer"
            style={{ display: "block", textAlign: "center", background: MUTED, border: "1px solid " + BORDER, color: MUTED_FG, borderRadius: 10, padding: "9px 0", fontWeight: 700, fontSize: 12, textDecoration: "none", marginTop: 10 }}>📩 Send booking details to us</a> : null}
          {salon.contact_phone ? <p style={{ margin: "12px 0 0", fontSize: 12, color: MUTED_FG }}>Need to change something? Call {salon.contact_phone} and quote your reference.</p> : null}
        </Card>
      </Shell>
    );
  }

  var maxDate = addDays(today, info.max_days_ahead);
  var groups = groupByCategory(info.services);
  var section = { padding: 16, marginBottom: 14, borderTop: brand.branded ? "3px solid " + brand.primary : undefined };
  var h = { fontSize: 13, fontWeight: 800, marginBottom: 10 };
  return (
    <Shell salon={salon}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px", fontWeight: 800, color: brand.accentOnBg }}>Request a grooming appointment</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: brand.onBgMuted, lineHeight: 1.5 }}>
        Choose a service and a time. {salon.name || "We"} will confirm your request.{info.hours.length ? " Open " + hoursSummary(info.hours) + "." : ""}
      </p>

      <Card style={section}>
        <div style={h}>1. Choose services</div>
        {groups.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>No services can be booked online yet. Please contact us.</p> : groups.map(function (g) {
          return (
            <div key={g.category} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED_FG, margin: "6px 0" }}>{g.category.toUpperCase()}</div>
              {g.services.map(function (s) {
                var on = serviceIds.indexOf(s.id) !== -1;
                return (
                  <label key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", border: "1px solid " + (on ? brand.primary : BORDER), boxShadow: on ? "0 0 0 1px " + brand.primary : "none", borderRadius: 10, marginBottom: 6, cursor: "pointer", background: CARD }}>
                    <input type="checkbox" checked={on} onChange={function () { toggleService(s.id); }} style={{ marginTop: 3, accentColor: brand.primary }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: MUTED_FG }}>{durationLabel(s.duration_minutes)}{s.description ? " · " + s.description : ""}</span>
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(s.price)}</span>
                  </label>
                );
              })}
            </div>
          );
        })}
        {serviceIds.length ? <div style={{ fontSize: 13, color: MUTED_FG, marginTop: 6 }}>{durationLabel(totals.minutes)} · {fmt(totals.price)} in total</div> : null}
      </Card>

      <Card style={section}>
        <div style={h}>2. Pick a day and time</div>
        <Field label="Day" htmlFor="pb-date">
          <input id="pb-date" type="date" style={inputStyle} min={today} max={maxDate} value={date} disabled={serviceIds.length === 0}
            onChange={function (e) { setDate(e.target.value); setErr(""); }} />
        </Field>
        {serviceIds.length === 0 ? <p style={{ margin: "0 0 4px", fontSize: 12, color: MUTED_FG }}>Choose a service first.</p> : null}
        {slotLoad === "loading" ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>Checking available times…</p> : null}
        {slotLoad === "error" ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>We couldn't check times for that day. Please try again.</p> : null}
        {slotLoad === "ready" && slots && slots.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>No times are available on that day. Please try another day.</p> : null}
        {slotLoad === "ready" && slots && slots.length > 0 ? (
          <div role="group" aria-label="Available times" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {slots.map(function (s) {
              var on = s === start;
              return (
                <button key={s} type="button" aria-pressed={on} onClick={function () { setStart(s); setErr(""); }}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid " + (on ? brand.primary : BORDER), background: on ? brand.primary : CARD, color: on ? brand.onPrimary : FOREGROUND, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {slotTime(s, tz)}
                </button>
              );
            })}
          </div>
        ) : null}
      </Card>

      <Card style={section}>
        <div style={h}>3. Your details</div>
        <Field label="Your name" htmlFor="pb-name"><input id="pb-name" style={inputStyle} autoComplete="name" maxLength={80} value={form.name} onChange={function (e) { setF("name", e.target.value); }} /></Field>
        <Field label="Phone number" htmlFor="pb-phone"><input id="pb-phone" style={inputStyle} inputMode="tel" autoComplete="tel" placeholder="0712 345 678" maxLength={20} value={form.phone} onChange={function (e) { setF("phone", e.target.value); }} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Pet's name" htmlFor="pb-pet"><input id="pb-pet" style={inputStyle} maxLength={60} value={form.pet} onChange={function (e) { setF("pet", e.target.value); }} /></Field>
          <Field label="Type of pet" htmlFor="pb-species">
            <select id="pb-species" style={inputStyle} value={form.species} onChange={function (e) { setF("species", e.target.value); }}>{SPECIES.map(function (s) { return <option key={s} value={s}>{s}</option>; })}</select>
          </Field>
        </div>
        <Field label="Breed (optional)" htmlFor="pb-breed"><input id="pb-breed" style={inputStyle} maxLength={60} value={form.breed} onChange={function (e) { setF("breed", e.target.value); }} /></Field>
        <Field label="Anything we should know? (optional)" htmlFor="pb-notes"><textarea id="pb-notes" rows={3} maxLength={300} style={Object.assign({}, inputStyle, { resize: "vertical", fontFamily: "inherit" })} value={form.notes} onChange={function (e) { setF("notes", e.target.value); }} /></Field>
        {/* Hidden from people; bots tend to fill it. Anything typed here makes the server discard the request. */}
        <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={function (e) { setF("website", e.target.value); }} /></label>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: MUTED_FG, lineHeight: 1.5, margin: "6px 0 12px" }}>
          <input type="checkbox" checked={form.consent} onChange={function (e) { setF("consent", e.target.checked); }} style={{ marginTop: 3, accentColor: brand.primary }} />
          <span>I agree that {salon.name || "the business"} may contact me about this request on the phone number I gave. My details are used only to arrange this appointment.</span>
        </label>
        <ErrorLine>{err}</ErrorLine>
        <Button brand={brand} onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send request"}</Button>
        {start ? <p style={{ margin: "10px 0 0", fontSize: 12, color: MUTED_FG }}>Requested: {slotDateTime(start, tz)}</p> : null}
      </Card>
    </Shell>
  );
}
