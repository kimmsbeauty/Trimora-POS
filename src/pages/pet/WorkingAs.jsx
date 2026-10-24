// "Working as" picker for the Pet shell footer. Attribution for the audit trail (migration
// 087), NOT authentication -- see src/lib/petActor.js.
import { useState, useEffect } from "react";
import { db } from "../../lib/db";
import { getPetActor, setPetActor } from "../../lib/petActor";
import { SIDEBAR_FG, SIDEBAR_MUTED, FONT_BODY } from "./theme";

export default function WorkingAs() {
  var staffState = useState(null); var staff = staffState[0]; var setStaff = staffState[1];
  var actorState = useState(getPetActor); var actor = actorState[0]; var setActor = actorState[1];

  useEffect(function () {
    var cancelled = false;
    db("GET", "staff", null, "?select=id,name,active&order=name").then(function (rows) {
      if (cancelled) return;
      var list = Array.isArray(rows) ? rows.filter(function (r) { return r.active !== false; }) : [];
      setStaff(list);
      // a remembered actor who is no longer an active staff member is dropped
      var cur = getPetActor();
      if (cur && !list.some(function (r) { return r.id === cur; })) { setPetActor(null); setActor(null); }
    });
    return function () { cancelled = true; };
  }, []);

  if (!staff || staff.length === 0) return null;

  function change(e) { var v = e.target.value || null; setPetActor(v); setActor(v); }

  return (
    <label style={{ display: "block", margin: "0 4px 10px", fontFamily: FONT_BODY }}>
      <span style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: SIDEBAR_MUTED, marginBottom: 4 }}>
        Working as
      </span>
      <select value={actor || ""} onChange={change} aria-label="Working as"
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", fontSize: 13, borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", color: SIDEBAR_FG, fontFamily: FONT_BODY }}>
        <option value="" style={{ color: "#000" }}>Not selected</option>
        {staff.map(function (s) { return <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.name}</option>; })}
      </select>
    </label>
  );
}
