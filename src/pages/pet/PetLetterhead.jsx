// src/pages/pet/PetLetterhead.jsx
//
// The business's own branding block shared by printed invoices and receipts: the logo
// from salon_settings.logo_url (Settings), falling back to the business name in text when
// there is no logo or the image fails to load, plus tagline, phone and (when asked) the
// tax PIN.
import React, { useState } from "react";
import { FOREGROUND, MUTED_FG } from "./theme";

export default function PetLetterhead({ salon, showTaxPin }) {
  var failState = useState(false); var failed = failState[0]; var setFailed = failState[1];
  var name = (salon && salon.name) || "";
  var logoUrl = salon && salon.logo_url;
  var hasLogo = !!logoUrl && !failed;
  return (
    <div style={{ minWidth: 0 }}>
      {hasLogo ? (
        <img src={logoUrl} alt={name + " logo"} onError={function () { setFailed(true); }}
          style={{ maxHeight: 64, maxWidth: 220, objectFit: "contain", display: "block", marginBottom: 6 }} />
      ) : (
        <div style={{ fontSize: 22, fontWeight: 800, color: FOREGROUND }}>{name}</div>
      )}
      {hasLogo ? <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div> : null}
      {salon && salon.tagline ? <div style={{ fontSize: 12, color: MUTED_FG }}>{salon.tagline}</div> : null}
      {salon && salon.contact_phone ? <div style={{ fontSize: 12, color: MUTED_FG }}>Tel: {salon.contact_phone}</div> : null}
      {showTaxPin && salon && salon.tax_pin ? <div style={{ fontSize: 12, color: MUTED_FG }}>KRA PIN: {salon.tax_pin}</div> : null}
    </div>
  );
}
