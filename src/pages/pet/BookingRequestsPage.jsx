// src/pages/pet/BookingRequestsPage.jsx
//
// Staff inbox for online booking requests (migration 108). Accepting creates the customer,
// pet and booking through the same database function as the Calendar, so every conflict
// rule still applies; declining records a reason. Requests do not hold a time slot, so
// two people may have asked for the same time: staff settle that here.
import React, { useEffect, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { MUTED_FG, MUTED, BORDER } from "./theme";
import { whatsappUrl } from "./reminderData";
import { slotDateTime, staffRequestErrorMessage } from "./publicBookingData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

var STATUS = { new: { tone: "warning", label: "New" }, accepted: { tone: "success", label: "Accepted" }, declined: { tone: "neutral", label: "Declined" } };

// <input type="datetime-local"> value (local time) from an ISO instant, and back.
function toLocalInput(iso) {
  var d = new Date(iso); var p = function (n) { return n < 10 ? "0" + n : "" + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}

export default function BookingRequestsPage() {
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var loadState = useState("loading"); var load = loadState[0]; var setLoad = loadState[1];
  var tickState = useState(0); var tick = tickState[0]; var setTick = tickState[1];
  var tabState = useState("new"); var tab = tabState[0]; var setTab = tabState[1];
  var acceptState = useState(null); var accepting = acceptState[0]; var setAccepting = acceptState[1]; // {req, staffId, when}
  var declineState = useState(null); var declining = declineState[0]; var setDeclining = declineState[1]; // {req, reason}
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var noticeState = useState(""); var notice = noticeState[0]; var setNotice = noticeState[1];

  useEffect(function () {
    var cancelled = false;
    setLoad("loading");
    Promise.all([
      db("GET", "pet_booking_requests", null, "?select=*&order=created_at.desc&limit=300"),
      db("GET", "staff", null, "?select=id,name,active&order=name.asc&limit=200"),
      db("GET", "pet_public_booking_settings", null, "?select=enabled&limit=1"),
    ]).then(function (res) {
      if (cancelled) return;
      if (!Array.isArray(res[0])) { setLoad(Array.isArray(res[1]) ? "needs-db" : "error"); return; }
      setData({ requests: res[0], staff: Array.isArray(res[1]) ? res[1].filter(function (s) { return s.active !== false; }) : [], enabled: Array.isArray(res[2]) && res[2][0] ? !!res[2][0].enabled : false });
      setLoad("ready");
    });
    return function () { cancelled = true; };
  }, [tick]);

  function reload() { setTick(tick + 1); }

  async function confirmAccept() {
    if (busy || !accepting) return;
    var r = accepting.req;
    var changed = accepting.when && accepting.when !== toLocalInput(r.starts_at);
    var iso = null;
    if (changed) { var d = new Date(accepting.when); if (isNaN(d.getTime())) { setErr("Enter a valid date and time."); return; } iso = d.toISOString(); }
    setBusy(true); setErr("");
    var res = await dbRpcAuth("pet_accept_booking_request", { p_request_id: r.id, p_staff_id: accepting.staffId || null, p_starts_at: iso });
    setBusy(false);
    if (res && res.error) { setErr(staffRequestErrorMessage(res.error)); return; }
    setAccepting(null); setNotice("Booking created for " + r.customer_name + ". You can see it on the calendar."); reload();
  }
  async function confirmDecline() {
    if (busy || !declining) return;
    setBusy(true); setErr("");
    var res = await dbRpcAuth("pet_decline_booking_request", { p_request_id: declining.req.id, p_reason: declining.reason.trim() || null });
    setBusy(false);
    if (res && res.error) { setErr(staffRequestErrorMessage(res.error)); return; }
    setDeclining(null); setNotice("Request declined."); reload();
  }

  if (load === "loading") return <div><PageHeader title="Online Requests" /><p style={{ color: MUTED_FG, fontSize: 13 }}>Loading…</p></div>;
  if (load === "error") return <div><PageHeader title="Online Requests" /><Card><EmptyState title="Couldn't load requests" description="Check your connection and try again." action={<Button onClick={reload}>Try again</Button>} /></Card></div>;
  if (load === "needs-db") return <div><PageHeader title="Online Requests" /><Card><EmptyState title="Online requests need a database update" description="Ask your administrator to apply migration 108, then refresh." action={<Button onClick={reload}>Refresh</Button>} /></Card></div>;

  var newOnes = data.requests.filter(function (r) { return r.status === "new"; });
  var handled = data.requests.filter(function (r) { return r.status !== "new"; });
  var list = tab === "new" ? newOnes : handled;

  return (
    <div>
      <PageHeader title="Online Requests" subtitle="Requests from your online booking page. Accept one to put it on the calendar." />
      {!data.enabled ? <Card style={{ padding: 12, marginBottom: 12, fontSize: 13, color: MUTED_FG }}>Your online booking page is switched off, so no new requests will arrive. Turn it on in Settings.</Card> : null}
      {notice ? <div role="status" style={{ marginBottom: 12, padding: 10, border: "1px solid " + BORDER, borderRadius: 10, background: MUTED, fontSize: 13 }}>{notice}</div> : null}
      <div role="tablist" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button variant={tab === "new" ? "primary" : "outline"} onClick={function () { setTab("new"); }}>New ({newOnes.length})</Button>
        <Button variant={tab === "handled" ? "primary" : "outline"} onClick={function () { setTab("handled"); }}>Handled ({handled.length})</Button>
      </div>

      {list.length === 0 ? (
        <Card><EmptyState title={tab === "new" ? "No new requests" : "Nothing handled yet"} description={tab === "new" ? "When someone sends a request from your online booking page it will appear here." : "Accepted and declined requests will be listed here."} /></Card>
      ) : list.map(function (r) {
        var st = STATUS[r.status]; var wa = whatsappUrl(r.phone, "");
        return (
          <Card key={r.id} style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.customer_name}<span style={{ color: MUTED_FG, fontWeight: 500 }}> · {r.pet_name} ({r.species}{r.breed ? ", " + r.breed : ""})</span></div>
                <div style={{ fontSize: 12, color: MUTED_FG }}>{r.service_summary} · {r.duration_minutes} min</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>Wants {slotDateTime(r.starts_at, "Africa/Nairobi")}</div>
                <div style={{ fontSize: 12, color: MUTED_FG }}>
                  {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>+{r.phone}</a> : "+" + r.phone} · ref {r.reference} · received {new Date(r.created_at).toLocaleString()}
                </div>
                {r.notes ? <div style={{ fontSize: 12, marginTop: 4 }}>Note: {r.notes}</div> : null}
                {r.status === "declined" && r.decline_reason ? <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 2 }}>Reason: {r.decline_reason}</div> : null}
              </div>
              <Badge tone={st.tone}>{st.label}</Badge>
              {r.status === "new" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" onClick={function () { setErr(""); setNotice(""); setAccepting({ req: r, staffId: "", when: toLocalInput(r.starts_at) }); }} ariaLabel={"Accept request from " + r.customer_name}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={function () { setErr(""); setNotice(""); setDeclining({ req: r, reason: "" }); }} ariaLabel={"Decline request from " + r.customer_name}>Decline</Button>
                </div>
              ) : null}
            </div>
          </Card>
        );
      })}

      <Modal open={!!accepting} onClose={function () { if (!busy) { setAccepting(null); setErr(""); } }} title={accepting ? "Accept request from " + accepting.req.customer_name : ""}
        footer={<>
          <Button variant="ghost" onClick={function () { setAccepting(null); setErr(""); }} disabled={busy}>Cancel</Button>
          <Button onClick={confirmAccept} disabled={busy}>{busy ? "Creating…" : "Create booking"}</Button>
        </>}>
        {accepting ? (
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: MUTED_FG, lineHeight: 1.5 }}>
              This adds {accepting.req.customer_name} and {accepting.req.pet_name} to your records if they aren't there already, and books {accepting.req.service_summary}.
            </p>
            <Field label="Date and time" htmlFor="acc-when"><input id="acc-when" type="datetime-local" style={inputStyle} value={accepting.when} onChange={function (e) { setAccepting(Object.assign({}, accepting, { when: e.target.value })); }} /></Field>
            <Field label="Groomer (optional)" htmlFor="acc-staff">
              <select id="acc-staff" style={inputStyle} value={accepting.staffId} onChange={function (e) { setAccepting(Object.assign({}, accepting, { staffId: e.target.value })); }}>
                <option value="">Not assigned yet</option>
                {data.staff.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
              </select>
            </Field>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!declining} onClose={function () { if (!busy) { setDeclining(null); setErr(""); } }} title="Decline this request?"
        footer={<>
          <Button variant="ghost" onClick={function () { setDeclining(null); setErr(""); }} disabled={busy}>Keep it</Button>
          <Button variant="danger" onClick={confirmDecline} disabled={busy}>{busy ? "Declining…" : "Decline request"}</Button>
        </>}>
        {declining ? (
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: MUTED_FG, lineHeight: 1.5 }}>The customer isn't notified automatically. Message them on WhatsApp or call them to explain.</p>
            <Field label="Reason (optional, for your records)" htmlFor="dec-reason"><input id="dec-reason" style={inputStyle} maxLength={200} value={declining.reason} onChange={function (e) { setDeclining(Object.assign({}, declining, { reason: e.target.value })); }} /></Field>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
