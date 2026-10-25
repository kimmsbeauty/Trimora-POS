// src/pages/SalonSettingsPage.jsx
//
// Admin-only settings page. Allows the salon owner to configure:
//   - Branding (name display, tagline, logo URL, primary/secondary color)
//   - Contact & payments (contact phone, M-Pesa till, M-Pesa name)
//   - Appearance preview
//   - PIN management (change staff PIN, change admin PIN)
//
// All settings are saved to the salon_settings table via db() PATCH.
// PIN changes go through the change_salon_pins RPC (migration 091), which needs the current
// admin PIN. salon_pins itself is never read or written from the client.
// salon_settings is now in TENANT_TABLES so db() auto-scopes all calls.

import { useState, useEffect } from "react";
import { db } from "../lib/db";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, RED, GREEN, AMBER } from "../lib/constants";
import { getValidAccessToken } from "../lib/deviceAuth";
import { changeSalonPins } from "../lib/pinApi";

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
  var [mpesaPaybill, setMpesaPaybill] = useState((salon && salon.mpesa_paybill) || "");
  var [mpesaAccount, setMpesaAccount] = useState((salon && salon.mpesa_account) || "");
  var [mpesaSendMoneyPhone, setMpesaSendMoneyPhone] = useState((salon && salon.mpesa_send_money_phone) || "");
  var [enabledPaymentMethods, setEnabledPaymentMethods] = useState(
    (salon && salon.enabled_payment_methods) || ["Cash", "Till"]
  );
  var [receiptFooter,setReceiptFooter]= useState((salon && salon.receipt_footer) || "");
  var [contactSaving,  setContactSaving]  = useState(false);
  var [contactSaved,   setContactSaved]   = useState(false);
  var [contactError,   setContactError]   = useState("");

  function togglePaymentMethod(method) {
    setEnabledPaymentMethods(function(prev) {
      if (method === "Cash") return prev; // Cash always stays
      return prev.includes(method)
        ? prev.filter(function(m) { return m !== method; })
        : prev.concat(method);
    });
    setContactSaved(false);
  }

  // ── M-Pesa STK Push (Daraja) fields ───────────────────────────────
  // Lives in salon_mpesa_config, not salon_settings - a separate table
  // since it's only ever read by edge functions via the service role,
  // never through the normal TENANT_TABLES auto-scoped db() path.
  var [mpesaConfigId,      setMpesaConfigId]      = useState(null);
  var [hasSavedStkCreds,   setHasSavedStkCreds]   = useState(false);
  var [consumerKey,        setConsumerKey]        = useState("");
  var [consumerSecret,     setConsumerSecret]     = useState(""); // write-only - never re-fetched or displayed
  var [stkShortcode,       setStkShortcode]       = useState("");
  var [transactionType,    setTransactionType]    = useState("CustomerBuyGoodsOnline");
  var [stkSaving, setStkSaving] = useState(false);
  var [stkSaved,  setStkSaved]  = useState(false);
  var [stkError,  setStkError]  = useState("");

  useEffect(function() {
    if (!salon || !salon.id) return;
    (async function() {
      var result = await db("GET", "salon_mpesa_config", null, "?salon_id=eq." + salon.id + "&select=id,shortcode,transaction_type,consumer_key");
      if (result && result[0]) {
        setMpesaConfigId(result[0].id);
        setStkShortcode(result[0].shortcode || "");
        setTransactionType(result[0].transaction_type || "CustomerBuyGoodsOnline");
        setConsumerKey(result[0].consumer_key || "");
        setHasSavedStkCreds(true);
      }
    })();
  }, [salon && salon.id]);

  async function saveStkConfig() {
    setStkError("");
    if (!stkShortcode || !/^\d{5,10}$/.test(stkShortcode)) {
      setStkError("Shortcode/Till number should be 5–10 digits.");
      return;
    }
    if (!consumerKey.trim()) {
      setStkError("Consumer Key is required.");
      return;
    }
    if (!hasSavedStkCreds && !consumerSecret.trim()) {
      setStkError("Consumer Secret is required.");
      return;
    }
    setStkSaving(true);
    var payload = {
      salon_id: salon.id,
      shortcode: stkShortcode,
      transaction_type: transactionType,
      consumer_key: consumerKey.trim(),
    };
    // Only send the secret if something was actually typed - blank means
    // "keep the existing one", since we never fetch it back to display.
    if (consumerSecret.trim()) {
      payload.consumer_secret = consumerSecret.trim();
    }
    var ok;
    if (mpesaConfigId) {
      ok = await db("PATCH", "salon_mpesa_config", payload, "?id=eq." + mpesaConfigId);
    } else {
      ok = await db("POST", "salon_mpesa_config", payload);
      if (ok && ok[0]) setMpesaConfigId(ok[0].id);
    }
    setStkSaving(false);
    if (ok === null) { setStkError("Save failed. Check your connection."); return; }
    setHasSavedStkCreds(true);
    setConsumerSecret("");
    setStkSaved(true);
    autoResetSaved(setStkSaved);
  }

  // ── PIN fields ───────────────────────────────────────────────────
  var [currentAdminPin, setCurrentAdminPin] = useState("");
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
  var [selectedPlan, setSelectedPlan] = useState("");

  // Subscription plan prices — fetched from DB so Super Admin can
  // update them without a code change.
  var [planPrices, setPlanPrices] = useState(null); // null = still loading

  function fetchPlanPrices() {
    fetch(SUPABASE_URL + "/rest/v1/subscription_plans?order=sort_order.asc", {
      headers: { apikey: SUPABASE_KEY },
    })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        if (!Array.isArray(rows)) return;
        var map = {};
        rows.forEach(function(r) { map[r.key] = r; });
        setPlanPrices(map);
      })
      .catch(function() {});
  }

  // Fetch on mount, and re-fetch whenever the window regains focus
  // so price changes made in Super Admin are reflected without a full
  // page reload.
  useEffect(function() {
    fetchPlanPrices();
    window.addEventListener("focus", fetchPlanPrices);
    return function() { window.removeEventListener("focus", fetchPlanPrices); };
  }, []);

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
    if (mpesaPaybill && !/^\d{5,10}$/.test(mpesaPaybill)) {
      setContactError("Paybill number should be 5–10 digits.");
      return;
    }
    if (mpesaSendMoneyPhone && !/^(0|254|\+254)\d{9}$/.test(mpesaSendMoneyPhone.replace(/\s/g, ""))) {
      setContactError("Send Money phone should be a valid Kenyan number (e.g. 0712345678).");
      return;
    }
    if (contactPhone && !/^(0|254|\+254)\d{9}$/.test(contactPhone.replace(/\s/g, ""))) {
      setContactError("Enter a valid Kenyan phone number (e.g. 0712345678).");
      return;
    }
    setContactSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      contact_phone:           contactPhone || null,
      mpesa_till:              mpesaTill || null,
      mpesa_name:              mpesaName || null,
      mpesa_paybill:           mpesaPaybill || null,
      mpesa_account:           mpesaAccount || null,
      mpesa_send_money_phone:  mpesaSendMoneyPhone || null,
      enabled_payment_methods: enabledPaymentMethods,
      receipt_footer:          receiptFooter || null,
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
    if (!currentAdminPin) {
      setPinError("Enter your current admin PIN to confirm this change.");
      return;
    }

    setPinSaving(true);

    // Server-side (migration 091): both PINs change in ONE atomic call and the CURRENT admin
    // PIN is required as proof. Never write raw or client-hashed values to salon_pins.
    var token = await getValidAccessToken();
    var result = await changeSalonPins({
      token: token,
      currentAdminPin: currentAdminPin,
      newStaffPin: newStaffPin,
      newAdminPin: newAdminPin,
    });
    setPinSaving(false);

    if (!result.ok) {
      setPinError(result.error);
      return;
    }

    setCurrentAdminPin("");
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

        <Field label="M-Pesa Till Number (Buy Goods)">
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

        <Field label="M-Pesa Paybill Number">
          <input
            value={mpesaPaybill}
            onChange={function(e) { setMpesaPaybill(e.target.value); setContactSaved(false); }}
            placeholder="e.g. 522522"
            style={inputStyle}
          />
        </Field>

        <Field label="Paybill Account Number">
          <input
            value={mpesaAccount}
            onChange={function(e) { setMpesaAccount(e.target.value); setContactSaved(false); }}
            placeholder="e.g. your phone number or business name"
            style={inputStyle}
          />
        </Field>

        <Field label="Send Money Phone Number">
          <input
            value={mpesaSendMoneyPhone}
            onChange={function(e) { setMpesaSendMoneyPhone(e.target.value); setContactSaved(false); }}
            placeholder="0712345678"
            style={inputStyle}
          />
          <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Customer sends M-Pesa directly to this number</div>
        </Field>

        <Field label="Payment Methods at Checkout">
          <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
            Cash is always available. Enable the M-Pesa options your salon accepts.
          </div>
          {["Till", "Paybill", "Send Money"].map(function(method) {
            var isOn = enabledPaymentMethods.includes(method);
            return (
              <div key={method} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div
                  onClick={function() { togglePaymentMethod(method); }}
                  style={{
                    width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                    background: isOn ? "#4ADE80" : "#E5E7EB",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2, left: isOn ? 18 : 2,
                    width: 16, height: 16, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>
                  {method === "Till" ? "Buy Goods (Till)" : method === "Send Money" ? "Send Money (Person to Person)" : "Paybill"}
                </span>
              </div>
            );
          })}
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

      {/* ── M-PESA STK PUSH (DARAJA) ────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}><span>📲</span> M-Pesa STK Push</div>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 14, marginTop: -8 }}>
          {hasSavedStkCreds
            ? "Connected. Customers get a real payment prompt on their phone at checkout."
            : "Not connected yet — checkout falls back to manual till payment until this is set up."}
          {" "}Get these from your own Safaricom Daraja app at <b>developer.safaricom.co.ke</b>.
        </div>

        <Field label="Shortcode / Till Number">
          <input
            value={stkShortcode}
            onChange={function(e) { setStkShortcode(e.target.value); setStkSaved(false); }}
            placeholder="5927571"
            style={inputStyle}
          />
        </Field>

        <Field label="Transaction Type">
          <select
            value={transactionType}
            onChange={function(e) { setTransactionType(e.target.value); setStkSaved(false); }}
            style={inputStyle}
          >
            <option value="CustomerBuyGoodsOnline">Till Number (Buy Goods)</option>
            <option value="CustomerPayBillOnline">Paybill</option>
          </select>
        </Field>

        <Field label="Consumer Key">
          <input
            value={consumerKey}
            onChange={function(e) { setConsumerKey(e.target.value); setStkSaved(false); }}
            placeholder="From your Daraja app"
            style={inputStyle}
          />
        </Field>

        <Field label="Consumer Secret">
          <input
            type="password"
            value={consumerSecret}
            onChange={function(e) { setConsumerSecret(e.target.value); setStkSaved(false); }}
            placeholder={hasSavedStkCreds ? "•••••••• (leave blank to keep current)" : "From your Daraja app"}
            style={inputStyle}
          />
          <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Never shown again once saved, for safety — leave blank unless changing it.</div>
        </Field>

        {stkError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{stkError}</div>}
        <SaveBtn onClick={saveStkConfig} saving={stkSaving} saved={stkSaved} />
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

        <Field label="Current Admin PIN (required to change either PIN)">
          <input
            type="password"
            inputMode="numeric"
            value={currentAdminPin}
            onChange={function(e) { setCurrentAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinSaved(false); }}
            placeholder="Enter your current admin PIN"
            maxLength={6}
            autoComplete="off"
            style={inputStyle}
          />
        </Field>

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

      {/* ── SUBSCRIPTION ─────────────────────────────────────────── */}
      <div style={Object.assign({}, sectionStyle, { background: "#FFFBEB", border: "1.5px solid #FDE68A" })}>
        <div style={sectionTitleStyle}><span>💳</span> Subscription</div>

        {/* Current plan */}
        {salon && salon.subscription_plan ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: DARK, textTransform: "capitalize" }}>
                  {(salon.subscription_plan || "").replace("_", " ")} Plan
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  {salon.subscription_status === "lifetime"
                    ? "✓ Lifetime access — never expires"
                    : salon.subscription_expires_at
                      ? (new Date(salon.subscription_expires_at) > new Date()
                          ? "Expires " + new Date(salon.subscription_expires_at).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
                          : "⚠️ Expired " + new Date(salon.subscription_expires_at).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }))
                      : ""}
                </div>
              </div>
              <div style={{
                background: salon.subscription_status === "lifetime" ? GOLD_DIM + "22" :
                            salon.subscription_status === "active"   ? GREEN + "22" :
                            salon.subscription_status === "grace"    ? AMBER + "22" : RED + "22",
                color:      salon.subscription_status === "lifetime" ? GOLD_DIM :
                            salon.subscription_status === "active"   ? GREEN :
                            salon.subscription_status === "grace"    ? AMBER : RED,
                borderRadius: 20, padding: "4px 12px",
                fontSize: 11, fontWeight: 800, textTransform: "uppercase",
              }}>
                {salon.subscription_status || "active"}
              </div>
            </div>
            {salon.subscription_grace && (
              <div style={{ background: "#FEF3C7", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#92400E", marginTop: 8 }}>
                ⏰ Grace period: {salon.subscription_days_overdue} day{salon.subscription_days_overdue !== 1 ? "s" : ""} overdue.
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>No active subscription. Choose a plan below to get started.</div>
        )}

        {/* Plan selector */}
        {salon && salon.subscription_status !== "lifetime" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#92400E", textTransform: "uppercase", marginBottom: 8 }}>
              {salon.subscription_plan ? "Renew or Upgrade" : "Choose a Plan"}
            </div>
            {planPrices === null ? (
              <div style={{ fontSize: 12, color: "#999", padding: "10px 0" }}>Loading plans...</div>
            ) : (
              Object.values(planPrices).map(function(plan) {
                return (
                  <div key={plan.key}
                    onClick={function() { setSelectedPlan(plan.key === selectedPlan ? "" : plan.key); }}
                    style={{
                      background: selectedPlan === plan.key ? GOLD_DIM + "11" : WHITE,
                      border: "1.5px solid " + (selectedPlan === plan.key ? GOLD_DIM : "#E5E7EB"),
                      borderRadius: 10, padding: "10px 14px", marginBottom: 8,
                      cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>{plan.label}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{plan.period_days ? plan.period_days + " days" : "Forever"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: GOLD_DIM }}>KES {plan.price_kes.toLocaleString()}</div>
                      {plan.save_label && <div style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>{plan.save_label}</div>}
                    </div>
                  </div>
                );
              })
            )}

            {selectedPlan && (
              <div style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 12, padding: "14px", marginTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#166534", marginBottom: 8 }}>
                  Pay via M-Pesa to activate
                </div>
                <div style={{ fontSize: 12, color: "#166534", marginBottom: 4 }}>
                  📱 <b>Lipa na M-Pesa → Buy Goods</b>
                </div>
                <div style={{ fontSize: 12, color: "#166534", marginBottom: 4 }}>
                  Till Number: <b style={{ fontSize: 14 }}>— Contact admin —</b>
                </div>
                <div style={{ fontSize: 12, color: "#166534", marginBottom: 10 }}>
                  Amount: <b>KES {planPrices && planPrices[selectedPlan] ? planPrices[selectedPlan].price_kes.toLocaleString() : "—"}</b>
                </div>
                <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6, marginBottom: 10 }}>
                  After payment, send your M-Pesa confirmation SMS screenshot to <b>admin@trimorasystems.com</b> or WhatsApp us. We'll activate your subscription within 2 hours.
                </div>
                <a href={"mailto:admin@trimorasystems.com?subject=Subscription Payment — " + (salon && salon.name) + "&body=Hi Trimora Team,%0D%0A%0D%0AI have made a payment for the " + selectedPlan.replace("_", " ") + " plan.%0D%0A%0D%0ASalon: " + (salon && salon.name) + "%0D%0APlan: " + selectedPlan.replace("_", " ") + "%0D%0A%0D%0APlease find my M-Pesa confirmation attached.%0D%0A%0D%0AThank you."}
                  style={{ display: "block", background: GOLD_DIM, color: WHITE, borderRadius: 10, padding: "11px 0", fontWeight: 900, fontSize: 13, textAlign: "center", textDecoration: "none" }}>
                  📧 Notify Trimora of Payment
                </a>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>
          Questions? Contact: <a href="mailto:admin@trimorasystems.com" style={{ color: GOLD_DIM, fontWeight: 800 }}>admin@trimorasystems.com</a>
        </div>
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
