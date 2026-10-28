// src/pages/pet/SendInvoiceModal.jsx
//
// Share one invoice by email or WhatsApp. By default (invoiceSendConfig.serverSend = false) the
// message opens in the staff member's OWN email / WhatsApp app with the text filled in, and they
// press send there: it goes from their own account and Trimora sends nothing. The recipient is
// pre-filled from the customer and can be corrected first.
// If server sending is switched on (pet-send-invoice edge function), Trimora sends it instead, and
// earlier sends of this invoice are shown so it isn't sent twice by accident.
import React, { useEffect, useRef, useState } from "react";
import { db } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, FOREGROUND } from "./theme";
import { outstanding } from "./invoiceData";
import { sendInvoice, invoiceSendConfig } from "./invoiceSend";
import { buildInvoiceMessage, invoiceSubject, whatsappUrl, mailtoUrl } from "./invoiceShare";
import { Button, Field, ErrorLine, Modal, Badge, inputStyle } from "./ui";

function when(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleString(); }

export default function SendInvoiceModal({ invoice, customer, pet, salon, email, channel, onClose }) {
  var isEmail = channel === "email";
  var toS = useState(isEmail ? (email || "") : ((customer && customer.phone) || "")); var to = toS[0]; var setTo = toS[1];
  var phaseS = useState("idle"); var phase = phaseS[0]; var setPhase = phaseS[1]; // idle | sending | sent | failed | unavailable
  var errS = useState(""); var err = errS[0]; var setErr = errS[1];
  var histS = useState([]); var history = histS[0]; var setHistory = histS[1];
  var tickS = useState(0); var tick = tickS[0]; var setTick = tickS[1];
  var alive = useRef(true);

  useEffect(function () { alive.current = true; return function () { alive.current = false; }; }, []);
  var serverSend = invoiceSendConfig.serverSend;
  useEffect(function () {
    if (!serverSend) return;
    db("GET", "pet_invoice_messages", null, "?select=channel,recipient,status,created_at&invoice_id=eq." + encodeURIComponent(invoice.id) + "&order=created_at.desc&limit=3")
      .then(function (rows) { if (alive.current && Array.isArray(rows)) setHistory(rows); });
  }, [invoice.id, tick]);

  var label = isEmail ? "email" : "WhatsApp";
  var sentBefore = history.filter(function (h) { return h.status === "sent"; })[0];

  async function send() {
    if (phase === "sending") return;
    setPhase("sending"); setErr("");
    var res = await sendInvoice({ salonId: salon && salon.id, invoiceId: invoice.id, channel: channel, to: to.trim() });
    if (!alive.current) return;
    if (res.ok) { setPhase("sent"); setTick(tick + 1); return; }
    setErr(res.message);
    setPhase(res.code === "NOT_CONFIGURED" ? "unavailable" : "failed");
  }

  function openInMyApp() {
    var message = buildInvoiceMessage(invoice, customer, pet, salon);
    if (isEmail) window.location.href = mailtoUrl(to, invoiceSubject(invoice, salon), message);
    else window.open(whatsappUrl(to, message), "_blank", "noopener,noreferrer");
  }

  var done = phase === "sent";
  var footer = !serverSend ? (
    <>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={function () { openInMyApp(); }} disabled={!to.trim()}>{isEmail ? "Open in my email app" : "Open in my WhatsApp"}</Button>
    </>
  ) : done ? <Button onClick={onClose}>Done</Button> : (
    <>
      <Button variant="ghost" onClick={onClose} disabled={phase === "sending"}>Cancel</Button>
      {phase === "unavailable" ? <Button variant="outline" onClick={openInMyApp}>{isEmail ? "Open in my email app" : "Open in my WhatsApp"}</Button> : null}
      <Button onClick={send} disabled={phase === "sending" || phase === "unavailable" || !to.trim()}>
        {phase === "sending" ? "Sending…" : sentBefore ? "Send again" : "Send " + label}
      </Button>
    </>
  );

  return (
    <Modal open onClose={phase === "sending" ? function () {} : onClose} title={"Send invoice " + invoice.invoice_number + " by " + label}
      description={(customer ? customer.name : "Customer") + " · " + fmt(invoice.total) + (outstanding(invoice) > 0 ? " · " + fmt(outstanding(invoice)) + " owed" : "")} footer={footer}>
      {serverSend && done ? (
        <div role="status" style={{ fontSize: 14, color: FOREGROUND }}>
          Sent to {to.trim()}. {isEmail ? "The email is on its way." : "WhatsApp accepted the message."} This doesn't confirm the customer has read it.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <Field label={isEmail ? "Send to this email address" : "Send to this WhatsApp number"} htmlFor="send-invoice-to">
            <input id="send-invoice-to" type={isEmail ? "email" : "tel"} inputMode={isEmail ? "email" : "tel"} style={inputStyle} value={to}
              disabled={phase === "sending"} onChange={function (e) { setTo(e.target.value); if (phase === "failed") setPhase("idle"); }} />
          </Field>
          {!to.trim() ? <div style={{ fontSize: 12, color: MUTED_FG }}>{isEmail ? "This customer has no email on file. Type one to send." : "This customer has no phone number on file. Type one to send."}</div> : null}
          {serverSend && sentBefore ? <Badge tone="warning">Already sent by {sentBefore.channel === "email" ? "email" : "WhatsApp"} to {sentBefore.recipient} on {when(sentBefore.created_at)}</Badge> : null}
          {!serverSend ? <div style={{ fontSize: 13, color: MUTED_FG }}>This opens your own {isEmail ? "email" : "WhatsApp"} app with the invoice already written. Press send there. {isEmail ? "No PDF is attached; print or save the invoice as a PDF first if you want to attach it." : ""}</div> : null}
          {phase === "unavailable" ? <div style={{ fontSize: 13, color: MUTED_FG }}>You can still open the message in your own {isEmail ? "email" : "WhatsApp"} app and press send there.</div> : null}
          <ErrorLine>{err}</ErrorLine>
        </div>
      )}
    </Modal>
  );
}
