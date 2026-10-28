// src/pages/pet/OnlineBookingChecklist.jsx
//
// "Online booking setup" card for the Overview page. Lists only what is still missing, and
// disappears once everything is done, when online booking is switched off, or when the data
// can't be loaded (it never guesses). Read-only; the links go to the screens where it is fixed.
import React, { useEffect, useState } from "react";
import { db } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { BORDER, MUTED_FG, FONT_HEADING } from "./theme";
import { Card, Button, Badge } from "./ui";
import { pendingSetupSteps } from "./onlineBookingSetup";

export default function OnlineBookingChecklist({ allowed, onGo }) {
  var salon = useSalon() || {};
  var svcState = useState(null); var services = svcState[0]; var setServices = svcState[1];
  var onState = useState(true); var enabled = onState[0]; var setEnabled = onState[1];

  useEffect(function () {
    var cancelled = false;
    Promise.all([
      db("GET", "pet_services", null, "?select=id,category,active,duration_minutes&active=eq.true&limit=500"),
      db("GET", "pet_public_booking_settings", null, "?select=enabled&limit=1"),
    ]).then(function (res) {
      if (cancelled) return;
      if (Array.isArray(res[0])) setServices(res[0]);
      // No settings row means the default (on); only an explicit "off" hides the checklist.
      setEnabled(!(Array.isArray(res[1]) && res[1][0] && res[1][0].enabled === false));
    }).catch(function () {});
    return function () { cancelled = true; };
  }, []);

  if (!services || !enabled) return null;
  var steps = pendingSetupSteps(services, salon.contact_phone);
  if (steps.length === 0) return null;

  return (
    <Card style={{ marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid " + BORDER }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 600, margin: 0 }}>Online booking setup</h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED_FG }}>Finish {steps.length === 1 ? "this step" : "these steps"} so customers can book online.</p>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map(function (s) {
          return (
            <li key={s.key} className="pet-ov-row">
              <div className="pet-ov-grow">
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: MUTED_FG }}>{s.hint}</div>
              </div>
              {allowed && allowed[s.target]
                ? <Button size="sm" variant="outline" ariaLabel={s.label} onClick={function () { onGo(s.target); }}>{s.action}</Button>
                : <Badge tone="neutral">Ask an administrator</Badge>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
