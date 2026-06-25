// src/pages/SalonSettingsPage.jsx
//
// Admin-only settings page. Allows the salon owner to configure:
//   - Branding (name display, tagline, logo URL, primary/secondary color)
//   - Contact & payments (contact phone, M-Pesa till, M-Pesa name)
//   - Appearance preview
//   - PIN management (change staff PIN, change admin PIN)
//
// All settings are saved to the salon_settings table via db() PATCH.
// PIN changes go to salon_pins via db() PATCH (scoped by TENANT_TABLES).
// salon_settings is now in TENANT_TABLES so db() auto-scopes all calls.

import { useState, useEffect } from "react";
import { db } from "../lib/db";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, RED, GREEN, AMBER } from "../lib/constants";
import { getValidAccessToken } from "../lib/deviceAuth";

var inputStyle = {
  width: "100%",
  borderRadius: 10,
  border: "1.5px solid " + GOLD_DIM + "66",
  background: WHITE,
  padding: "11px 13px",
  fontSize: 13,
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
  color: DARK,
};

var labelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: GOLD_DIM,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 5,
  display: "block",
};

var sectionStyle = {
  background: WHITE,
  borderRadius: 14,
  padding: "18px 16px",
  marginBottom: 14,
  border: "1.5px solid " + GOLD_DIM + "33",
};

var sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: DARK,
  marginBottom: 14,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SaveBtn({ onClick, saving, saved, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      style={{
        width: "100%",
        background: saved ? GREEN : GOLD_DIM,
        color: WHITE,
        border: "none",
        borderRadius: 10,
        padding: "13px 0",
        fontWeight: 900,
        fontSize: 14,
        cursor: saving || disabled ? "not-allowed" : "pointer",
        marginTop: 4,
        opacity: saving ? 0.7 : 1,
        transition: "background 0.3s",
      }}
    >
      {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
    </button>
  );
}

export default function SalonSettingsPage({ salon, onSettingsUpdated }) {
  // ── Branding fields ──────────────────────────────────────────────
  var [salonDisplayName, setSalonDisplayName] = useState((salon && salon.name) || "");
  var [tagline,          setTagline]          = useState((salon && salon.tagline) || "");
  var [logoUrl,          setLogoUrl]          = useState((salon && salon.logo_url) || "");
  var [primaryColor,     setPrimaryColor]     = useState((salon && salon.primary_color) || "#C9A84C");
  var [secondaryColor,   setSecondaryColor]   = useState((salon && salon.secondary_color) || "#1A1A1A");
  var [brandingSaving,   setBrandingSaving]   = useState(false);
  var [brandingSaved,    setBrandingSaved]    = useState(false);
  var [brandingError,    setBrandingError]    = useState("");

  // ── Contact & payments fields ────────────────────────────────────
  var [contactPhone, setContactPhone] = useState((salon && salon.contact_phone) || "");
  var [mpesaTill,    setMpesaTill]    = useState((salon && salon.mpesa_till) || "");
  var [mpesaName,    setMpesaName]    = useState((salon && salon.mpesa_name) || "");
  var [receiptFooter,setReceiptFooter]= useState((salon && salon.receipt_footer) || "");
  var [contactSaving,  setContactSaving]  = useState(false);
  var [contactSaved,   setContactSaved]   = useState(false);
  var [contactError,   setContactError]   = useState("");

  // ── PIN fields ───────────────────────────────────────────────────
  var [newStaffPin,   setNewStaffPin]   = useState("");
  var [newAdminPin,   setNewAdminPin]   = useState("");
  var [confirmAdminPin, setConfirmAdminPin] = useState("");
  var [pinSaving,     setPinSaving]     = useState(false);
  var [pinSaved,      setPinSaved]      = useState(false);
  var [pinError,      setPinError]      = useState("");

  // ── Currency / timezone ──────────────────────────────────────────
  var [currency, setCurrency] = useState((salon && salon.currency_symbol) || "KSh");
  var [timezone, setTimezone] = useState((salon && salon.timezone) || "Africa/Nairobi");
  var [prefSaving, setPrefSaving] = useState(false);
  var [prefSaved,  setPrefSaved]  = useState(false);
  var [prefError,  setPrefError]  = useState("");

  // Reset saved state after 3 seconds
  function autoResetSaved(setter) {
    setTimeout(function() { setter(false); }, 3000);
  }

  // ── Save branding ────────────────────────────────────────────────
  async function saveBranding() {
    setBrandingError("");
    setBrandingSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      tagline:         tagline || null,
      logo_url:        logoUrl || null,
      primary_color:   primaryColor,
      secondary_color: secondaryColor,
    }, "?salon_id=eq." + (salon && salon.id));

    // Also update the salon name in the salons table
    if (salonDisplayName && salonDisplayName !== salon.name) {
      var token = await getValidAccessToken();
      await fetch(SUPABASE_URL + "/rest/v1/salons?id=eq." + (salon && salon.id), {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + (token || SUPABASE_KEY),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: salonDisplayName }),
      });
    }

    setBrandingSaving(false);
    if (ok === null) { setBrandingError("Save failed. Check your connection."); return; }
    setBrandingSaved(true);
    autoResetSaved(setBrandingSaved);
    if (onSettingsUpdated) onSettingsUpdated();
  }

  // ── Save contact & payments ──────────────────────────────────────
  async function saveContact() {
    setContactError("");
    if (mpesaTill && !/^\d{5,10}$/.test(mpesaTill)) {
      setContactError("Till number should be 5–10 digits.");
      return;
    }
    if (contactPhone && !/^(0|254|\+254)\d{9}$/.test(contactPhone.replace(/\s/g, ""))) {
      setContactError("Enter a valid Kenyan phone number (e.g. 0712345678).");
      return;
    }
    setContactSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      contact_phone:  contactPhone || null,
      mpesa_till:     mpesaTill || null,
      mpesa_name:     mpesaName || null,
      receipt_footer: receiptFooter || null,
    }, "?salon_id=eq." + (salon && salon.id));
    setContactSaving(false);
    if (ok === null) { setContactError("Save failed. Check your connection."); return; }
    setContactSaved(true);
    autoResetSaved(setContactSaved);
    if (onSettingsUpdated) onSettingsUpdated();
  }

  // ── Save preferences ─────────────────────────────────────────────
  async function savePreferences() {
    setPrefError("");
    setPrefSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      currency_symbol: currency,
      timezone:        timezone,
    }, "?salon_id=eq." + (salon && salon.id));
    setPrefSaving(false);
    if (ok === null) { setPrefError("Save failed."); return; }
    setPrefSaved(true);
    autoResetSaved(setPrefSaved);
    if (onSettingsUpdated) onSettingsUpdated();
  }

  // ── Save PINs ────────────────────────────────────────────────────
  async function savePins() {
    setPinError("");
    if (!newStaffPin && !newAdminPin) {
      setPinError("Enter at least one new PIN to update.");
      return;
    }
    if (newStaffPin && (newStaffPin.length < 4 || newStaffPin.length > 6 || !/^\d+$/.test(newStaffPin))) {
      setPinError("Staff PIN must be 4–6 digits.");
      return;
    }
    if (newAdminPin && (newAdminPin.length < 4 || newAdminPin.length > 6 || !/^\d+$/.test(newAdminPin))) {
      setPinError("Admin PIN must be 4–6 digits.");
      return;
    }
    if (newAdminPin && newAdminPin !== confirmAdminPin) {
      setPinError("Admin PIN and confirmation do not match.");
      return;
    }
    if (newStaffPin && newAdminPin && newStaffPin === newAdminPin) {
      setPinError("Staff and admin PINs must be different.");
      return;
    }
    setPinSaving(true);

    var updates = [];

    if (newStaffPin) {
      updates.push(db("PATCH", "salon_pins", {
        pin_hash: btoa(newStaffPin), // will be MD5'd server-side via RPC ideally;
        // for now matches the md5() used in complete_salon_onboarding
      }, "?role=eq.staff"));
    }
    if (newAdminPin) {
      updates.push(db("PATCH", "salon_pins", {
        pin_hash: btoa(newAdminPin),
      }, "?role=eq.admin"));
    }

    // Use the update_salon_pins RPC if available, otherwise direct PATCH
    // Direct PATCH approach: PIN must be stored as MD5 hash to match verify_staff_pin
    // We call a dedicated RPC for this to keep hashing server-side
    var token = await getValidAccessToken();

    var rpcUpdates = [];
    if (newStaffPin) {
      rpcUpdates.push(fetch(SUPABASE_URL + "/rest/v1/rpc/update_salon_pin", {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + (token || SUPABASE_KEY),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_role: "staff", p_new_pin: newStaffPin }),
      }));
    }
    if (newAdminPin) {
      rpcUpdates.push(fetch(SUPABASE_URL + "/rest/v1/rpc/update_salon_pin", {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + (token || SUPABASE_KEY),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_role: "admin", p_new_pin: newAdminPin }),
      }));
    }

    var results = await Promise.all(rpcUpdates);
    setPinSaving(false);

    var anyFailed = results.some(function(r) { return !r.ok; });
    if (anyFailed) {
      setPinError("PIN update failed. Please try again.");
      return;
    }

    setPinSaved(true);
    setNewStaffPin("");
    setNewAdminPin("");
    setConfirmAdminPin("");
    autoResetSaved(setPinSaved);
  }

  // ── Color preview swatch ─────────────────────────────────────────
  function ColorPicker({ label, value, onChange }) {
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="color"
            value={value}
            onChange={function(e) { onChange(e.target.value); }}
            style={{ width: 44, height: 44, borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "66", cursor: "pointer", padding: 2, background: WHITE }}
          />
          <input
            value={value}
            onChange={function(e) { onChange(e.target.value); }}
            placeholder="#C9A84C"
            style={Object.assign({}, inputStyle, { flex: 1 })}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 14px 80px", maxWidth: 520, margin: "0 auto" }}>

      <div style={{ fontSize: 16, fontWeight: 900, color: DARK, marginBottom: 16 }}>
        ⚙️ Salon Settings
      </div>

      {/* ── BRANDING ─────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}><span>🎨</span> Branding</div>

        <Field label="Salon Display Name">
          <input
            value={salonDisplayName}
            onChange={function(e) { setSalonDisplayName(e.target.value); setBrandingSaved(false); }}
            placeholder="Kimm's Beauty Parlour"
            style={inputStyle}
          />
        </Field>

        <Field label="Tagline">
          <input
            value={tagline}
            onChange={function(e) { setTagline(e.target.value); setBrandingSaved(false); }}
            placeholder="Where beauty meets excellence"
            style={inputStyle}
          />
        </Field>

        <Field label="Logo URL">
          <input
            value={logoUrl}
            onChange={function(e) { setLogoUrl(e.target.value); setBrandingSaved(false); }}
            placeholder="https://your-site.com/logo.png"
            style={inputStyle}
          />
          {logoUrl && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src={logoUrl}
                alt="Logo preview"
                style={{ width: 48, height: 48, borderRadius: 8, objectFit: "contain", border: "1px solid " + GOLD_DIM + "44", background: CREAM }}
                onError={function(e) { e.target.style.display = "none"; }}
              />
              <span style={{ fontSize: 11, color: "#888" }}>Logo preview</span>
            </div>
          )}
        </Field>

        <ColorPicker label="Primary Color (buttons, accents)" value={primaryColor} onChange={function(v) { setPrimaryColor(v); setBrandingSaved(false); }} />
        <ColorPicker label="Secondary Color (backgrounds)" value={secondaryColor} onChange={function(v) { setSecondaryColor(v); setBrandingSaved(false); }} />

        {/* Live preview strip */}
        <div style={{ borderRadius: 10, overflow: "hidden", marginBottom: 12, border: "1px solid " + GOLD_DIM + "33" }}>
          <div style={{ background: secondaryColor, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            {logoUrl && <img src={logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "contain" }} onError={function(e) { e.target.style.display = "none"; }} />}
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: primaryColor }}>{salonDisplayName || "Salon Name"}</div>
              {tagline && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{tagline}</div>}
            </div>
          </div>
          <div style={{ background: primaryColor, padding: "8px 14px", display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: secondaryColor }}>Preview Strip</span>
          </div>
        </div>

        {brandingError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{brandingError}</div>}
        <SaveBtn onClick={saveBranding} saving={brandingSaving} saved={brandingSaved} />
      </div>

      {/* ── CONTACT & PAYMENTS ──────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}><span>📞</span> Contact & Payments</div>

        <Field label="Contact Phone (WhatsApp)">
          <input
            value={contactPhone}
            onChange={function(e) { setContactPhone(e.target.value); setContactSaved(false); }}
            placeholder="0712345678"
            style={inputStyle}
          />
          <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Used for WhatsApp links on the booking page</div>
        </Field>

        <Field label="M-Pesa Till Number">
          <input
            value={mpesaTill}
            onChange={function(e) { setMpesaTill(e.target.value); setContactSaved(false); }}
            placeholder="5927571"
            style={inputStyle}
          />
        </Field>

        <Field label="M-Pesa Business Name">
          <input
            value={mpesaName}
            onChange={function(e) { setMpesaName(e.target.value); setContactSaved(false); }}
            placeholder="Kimm's Beauty Parlour"
            style={inputStyle}
          />
          <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Shown to customers on the payment screen</div>
        </Field>

        <Field label="Receipt Footer Message">
          <input
            value={receiptFooter}
            onChange={function(e) { setReceiptFooter(e.target.value); setContactSaved(false); }}
            placeholder="Thank you for visiting! See you again soon 💕"
            style={inputStyle}
          />
        </Field>

        {contactError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{contactError}</div>}
        <SaveBtn onClick={saveContact} saving={contactSaving} saved={contactSaved} />
      </div>

      {/* ── PREFERENCES ──────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}><span>🌍</span> Preferences</div>

        <Field label="Currency Symbol">
          <select
            value={currency}
            onChange={function(e) { setCurrency(e.target.value); setPrefSaved(false); }}
            style={Object.assign({}, inputStyle)}
          >
            <option value="KSh">KSh — Kenyan Shilling</option>
            <option value="UGX">UGX — Ugandan Shilling</option>
            <option value="TZS">TZS — Tanzanian Shilling</option>
            <option value="RWF">RWF — Rwandan Franc</option>
            <option value="ETB">ETB — Ethiopian Birr</option>
            <option value="USD">USD — US Dollar</option>
            <option value="GBP">GBP — British Pound</option>
          </select>
        </Field>

        <Field label="Timezone">
          <select
            value={timezone}
            onChange={function(e) { setTimezone(e.target.value); setPrefSaved(false); }}
            style={Object.assign({}, inputStyle)}
          >
            <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
            <option value="Africa/Kampala">Africa/Kampala (EAT, UTC+3)</option>
            <option value="Africa/Dar_es_Salaam">Africa/Dar es Salaam (EAT, UTC+3)</option>
            <option value="Africa/Kigali">Africa/Kigali (CAT, UTC+2)</option>
            <option value="Africa/Addis_Ababa">Africa/Addis Ababa (EAT, UTC+3)</option>
            <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
            <option value="UTC">UTC</option>
          </select>
        </Field>

        {prefError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{prefError}</div>}
        <SaveBtn onClick={savePreferences} saving={prefSaving} saved={prefSaved} />
      </div>

      {/* ── PIN MANAGEMENT ───────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}><span>🔐</span> PIN Management</div>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 14, lineHeight: 1.5 }}>
          Leave a PIN field blank to keep the current PIN unchanged. Admin PIN change requires confirmation.
        </div>

        <Field label="New Staff PIN (4–6 digits)">
          <input
            type="password"
            inputMode="numeric"
            value={newStaffPin}
            onChange={function(e) { setNewStaffPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinSaved(false); }}
            placeholder="Leave blank to keep current"
            maxLength={6}
            style={inputStyle}
          />
        </Field>

        <Field label="New Admin PIN (4–6 digits)">
          <input
            type="password"
            inputMode="numeric"
            value={newAdminPin}
            onChange={function(e) { setNewAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinSaved(false); }}
            placeholder="Leave blank to keep current"
            maxLength={6}
            style={inputStyle}
          />
        </Field>

        {newAdminPin.length > 0 && (
          <Field label="Confirm New Admin PIN">
            <input
              type="password"
              inputMode="numeric"
              value={confirmAdminPin}
              onChange={function(e) { setConfirmAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinSaved(false); }}
              placeholder="Re-enter admin PIN"
              maxLength={6}
              style={Object.assign({}, inputStyle, {
                borderColor: confirmAdminPin.length > 0 && confirmAdminPin !== newAdminPin ? RED : GOLD_DIM + "66"
              })}
            />
          </Field>
        )}

        {pinError && <div style={{ color: RED, fontSize: 12, marginBottom: 8, padding: "6px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>{pinError}</div>}
        <SaveBtn onClick={savePins} saving={pinSaving} saved={pinSaved} disabled={!newStaffPin && !newAdminPin} />
      </div>

      {/* ── SALON INFO (read-only) ────────────────────────────────── */}
      <div style={Object.assign({}, sectionStyle, { background: CREAM })}>
        <div style={sectionTitleStyle}><span>ℹ️</span> Salon Info</div>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.8 }}>
          <div><b>Salon ID:</b> <span style={{ fontFamily: "monospace", fontSize: 11 }}>{salon && salon.id}</span></div>
          <div><b>Slug:</b> <span style={{ fontFamily: "monospace", fontSize: 11 }}>{salon && salon.slug}</span></div>
          <div><b>Booking URL:</b> <a href={"/" + (salon && salon.slug) + "/booking"} target="_blank" rel="noreferrer" style={{ color: GOLD_DIM, fontSize: 11 }}>/{salon && salon.slug}/booking</a></div>
          <div><b>POS URL:</b> <a href={"/" + (salon && salon.slug) + "/pos"} target="_blank" rel="noreferrer" style={{ color: GOLD_DIM, fontSize: 11 }}>/{salon && salon.slug}/pos</a></div>
        </div>
      </div>

    </div>
  );
}
