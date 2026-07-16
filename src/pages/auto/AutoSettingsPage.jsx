// src/pages/auto/AutoSettingsPage.jsx
//
// First pass of Auto Settings, per explicit direction to split the
// build: PIN Management, M-Pesa STK Push, and Salon Info now; Branding,
// Contact & Payments (beyond STK), Preferences, and Subscription in a
// follow-up.
//
// Deliberately NOT a copy-paste-and-reimagine: every save/fetch
// operation here (update_salon_pin RPC, salon_mpesa_config PATCH/POST)
// is ported line-for-line from SalonSettingsPage.jsx, not reinvented --
// update_salon_pin in particular is the exact security-sensitive RPC
// this session already verified live earlier (the pgcrypto/search_path
// fix). Divergence risk on a PIN-reset code path is exactly the kind of
// thing this project's "don't fork shared security logic" precedent
// (see LoginPage.jsx's isAuto prop) exists to prevent, so the actual
// validation rules, RPC payload shape, and error handling are identical
// to the source -- only the theme (Auto's INK/STEEL/CHROME/SIGNAL/
// ALERT/PAPER instead of POS's GOLD/BLACK/WHITE/CREAM/DARK) and the
// Salon Info section's links (Auto has no booking page -- item #10 is
// explicitly out of scope -- and the app URL is /auto, not /pos) differ.
//
// Why a separate file rather than an isAuto prop on SalonSettingsPage.jsx
// itself (the LoginPage precedent): LoginPage is a single small form:
// threading a theme branch through it was low-risk. SalonSettingsPage
// is 863 lines across 7 sections with colors threaded through
// module-level style constants throughout -- retheming that safely in
// one pass, for only 3 of its 7 sections, was judged higher-risk than
// porting just the needed logic into a new, smaller, Auto-themed file.
// The remaining 4 sections, when built, should follow this same file
// (or trigger revisiting this decision if it turns out to fight the
// codebase rather than fit it).

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/constants";
import { getValidAccessToken } from "../../lib/deviceAuth";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

var inputStyle = {
  width: "100%", boxSizing: "border-box", borderRadius: 10,
  border: "1.5px solid " + CHROME + "55", background: "rgba(255,255,255,0.04)",
  padding: "11px 13px", fontSize: 13, fontFamily: "inherit", outline: "none", color: PAPER,
};

var labelStyle = {
  fontSize: 11, fontWeight: 800, color: CHROME, textTransform: "uppercase",
  letterSpacing: "0.08em", marginBottom: 5, display: "block",
};

var sectionStyle = {
  background: STEEL, borderRadius: 14, padding: "18px 16px", marginBottom: 14,
  border: "1px solid rgba(143,166,184,0.15)",
};

var sectionTitleStyle = {
  fontSize: 14, fontWeight: 800, color: PAPER, marginBottom: 14,
  display: "flex", alignItems: "center", gap: 8,
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
        width: "100%", background: saved ? "#22C55E" : SIGNAL, color: INK, border: "none",
        borderRadius: 10, padding: "13px 0", fontWeight: 900, fontSize: 14,
        cursor: saving || disabled ? "not-allowed" : "pointer", marginTop: 4,
        opacity: saving || disabled ? 0.6 : 1, transition: "background 0.3s",
      }}
    >
      {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
    </button>
  );
}

function ColorPicker({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="color" value={value} onChange={function (e) { onChange(e.target.value); }}
          style={{ width: 44, height: 44, borderRadius: 8, border: "1.5px solid " + CHROME + "66", cursor: "pointer", padding: 2, background: "rgba(255,255,255,0.04)" }} />
        <input value={value} onChange={function (e) { onChange(e.target.value); }} placeholder="#C9A84C"
          style={Object.assign({}, inputStyle, { flex: 1 })} />
      </div>
    </div>
  );
}

function autoResetSaved(setter) {
  setTimeout(function () { setter(false); }, 3000);
}

export default function AutoSettingsPage() {
  var salon = useSalon();

  // ── Branding fields -- ported from SalonSettingsPage ────────────────
  // primary_color genuinely matters for Auto: AutoReceipt.jsx reuses
  // the shared SalonBrandmark component as-is (confirmed before writing
  // this -- SalonBrandmark is generic, no POS-specific styling baked
  // in), and SalonBrandmark falls back to salon.primary_color for its
  // crest when no logo is set. secondary_color/name/tagline/logo are
  // Core data too, same reasoning. None of this affects Auto's own app
  // chrome (nav, buttons, etc.) -- that stays the fixed Auto theme
  // regardless, same as before this section existed.
  var [salonDisplayName, setSalonDisplayName] = useState("");
  var [tagline, setTagline] = useState("");
  var [logoUrl, setLogoUrl] = useState("");
  var [primaryColor, setPrimaryColor] = useState("#C9A84C");
  var [secondaryColor, setSecondaryColor] = useState("#1A1A1A");
  var [brandingSaving, setBrandingSaving] = useState(false);
  var [brandingSaved, setBrandingSaved] = useState(false);
  var [brandingError, setBrandingError] = useState("");

  // ── Preferences fields -- ported from SalonSettingsPage ─────────────
  // Honest caveat, unlike Branding: nothing in Auto currently reads
  // currency_symbol or timezone -- money() throughout this session's
  // own Auto work hardcodes "KSh", and no date/time formatting reads
  // salon.timezone anywhere in src/pages/auto/. Included anyway because
  // it's the same shared Core field POS reads and because leaving a
  // salon's currency/timezone unset here while POS's own Settings page
  // can set it would be a confusing asymmetry -- but this section
  // currently only affects POS-side display, not Auto's, until/unless a
  // future pass wires Auto's own formatting to read it too.
  var [currency, setCurrency] = useState("KSh");
  var [timezone, setTimezone] = useState("Africa/Nairobi");
  var [prefSaving, setPrefSaving] = useState(false);
  var [prefSaved, setPrefSaved] = useState(false);
  var [prefError, setPrefError] = useState("");

  // ── Referral reward -- single configurable %, applied automatically
  // to both the referrer's next visit and the referred customer's first
  // visit (see BoardPage.jsx / CheckInPage.jsx). Snapshotted into each
  // auto_referrals row at the moment a referral is recorded, so changing
  // this later never retroactively alters a reward already promised.
  var [referralPct, setReferralPct] = useState("10");
  var [referralSaving, setReferralSaving] = useState(false);
  var [referralSaved, setReferralSaved] = useState(false);
  var [referralError, setReferralError] = useState("");

  // ── Tax (VAT) settings ────────────────────────────────────────────
  // VAT-inclusive: tax_rate is purely a display/reporting extraction
  // from prices that already include it -- no checkout math depends on
  // these fields. tax_pin is the KRA PIN shown on receipts when set.
  var [taxEnabled, setTaxEnabled] = useState(false);
  var [taxRate, setTaxRate] = useState("16");
  var [taxPin, setTaxPin] = useState("");
  var [taxSaving, setTaxSaving] = useState(false);
  var [taxSaved, setTaxSaved] = useState(false);
  var [taxError, setTaxError] = useState("");

  // ── Receipt customization ────────────────────────────────────────
  var [receiptFooter, setReceiptFooter] = useState("");
  var [receiptShowStaff, setReceiptShowStaff] = useState(true);
  var [receiptShowVehicle, setReceiptShowVehicle] = useState(true);
  var [receiptSaving, setReceiptSaving] = useState(false);
  var [receiptSaved, setReceiptSaved] = useState(false);
  var [receiptError, setReceiptError] = useState("");

  // ── Coupons ──────────────────────────────────────────────────────
  // Unlimited uses until expiry, no per-redemption tracking needed --
  // much simpler than Membership/Referral turned out to be. Applied
  // via a code lookup at checkout (BoardPage.jsx), not tied to any one
  // customer, so managed here in Settings rather than on a customer's
  // detail page the way Membership Plans are sold.
  var [coupons, setCoupons] = useState([]);
  var [showCouponEditor, setShowCouponEditor] = useState(false);
  var [couponForm, setCouponForm] = useState({ code: "", discount_pct: "", expires_at: "" });
  var [couponSaving, setCouponSaving] = useState(false);
  var [couponError, setCouponError] = useState("");

  useEffect(function () {
    if (!salon || !salon.id) return;
    (async function () {
      var rows = await db("GET", "salon_settings", null, "?salon_id=eq." + salon.id + "&limit=1");
      var s = rows && rows[0];
      if (!s) return;
      setTagline(s.tagline || "");
      setLogoUrl(s.logo_url || "");
      setPrimaryColor(s.primary_color || "#C9A84C");
      setSecondaryColor(s.secondary_color || "#1A1A1A");
      setCurrency(s.currency_symbol || "KSh");
      setTimezone(s.timezone || "Africa/Nairobi");
      setReferralPct(s.referral_reward_pct != null ? String(s.referral_reward_pct) : "10");
      setTaxEnabled(!!s.tax_enabled);
      setTaxRate(s.tax_rate != null ? String(s.tax_rate) : "16");
      setTaxPin(s.tax_pin || "");
      setReceiptFooter(s.receipt_footer_message || "");
      setReceiptShowStaff(s.receipt_show_staff !== false);
      setReceiptShowVehicle(s.receipt_show_vehicle !== false);
    })();
    setSalonDisplayName(salon.name || "");
  }, [salon && salon.id]);

  var loadCoupons = useCallback(async function () {
    if (!salon || !salon.id) return;
    var rows = await db("GET", "auto_coupons", null, "?order=created_at.desc");
    setCoupons(rows || []);
  }, [salon && salon.id]);

  useEffect(function () { loadCoupons(); }, [loadCoupons]);

  async function saveBranding() {
    setBrandingError("");
    setBrandingSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      tagline: tagline || null,
      logo_url: logoUrl || null,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    }, "?salon_id=eq." + (salon && salon.id));

    // Also update the salon name in the salons table -- identical
    // direct-fetch pattern to the source (salons isn't in db.js's
    // TENANT_TABLES for client writes; this relies on RLS allowing an
    // authenticated device to update its own salon's name field).
    if (salonDisplayName && salon && salonDisplayName !== salon.name) {
      var token = await getValidAccessToken();
      await fetch(SUPABASE_URL + "/rest/v1/salons?id=eq." + salon.id, {
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
  }

  async function savePreferences() {
    setPrefError("");
    setPrefSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      currency_symbol: currency,
      timezone: timezone,
    }, "?salon_id=eq." + (salon && salon.id));
    setPrefSaving(false);
    if (ok === null) { setPrefError("Save failed."); return; }
    setPrefSaved(true);
    autoResetSaved(setPrefSaved);
  }

  async function saveReferralPct() {
    setReferralError("");
    var pct = parseInt(referralPct, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) { setReferralError("Enter a whole number between 0 and 100."); return; }
    setReferralSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      referral_reward_pct: pct,
    }, "?salon_id=eq." + (salon && salon.id));
    setReferralSaving(false);
    if (ok === null) { setReferralError("Save failed."); return; }
    setReferralSaved(true);
    autoResetSaved(setReferralSaved);
  }

  async function saveTaxSettings() {
    setTaxError("");
    var rate = parseInt(taxRate, 10);
    if (isNaN(rate) || rate < 0 || rate > 100) { setTaxError("Enter a whole number between 0 and 100."); return; }
    setTaxSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      tax_enabled: taxEnabled,
      tax_rate: rate,
      tax_pin: taxPin.trim() || null,
    }, "?salon_id=eq." + (salon && salon.id));
    setTaxSaving(false);
    if (ok === null) { setTaxError("Save failed."); return; }
    setTaxSaved(true);
    autoResetSaved(setTaxSaved);
  }

  async function saveReceiptSettings() {
    setReceiptError("");
    setReceiptSaving(true);
    var ok = await db("PATCH", "salon_settings", {
      receipt_footer_message: receiptFooter.trim() || null,
      receipt_show_staff: receiptShowStaff,
      receipt_show_vehicle: receiptShowVehicle,
    }, "?salon_id=eq." + (salon && salon.id));
    setReceiptSaving(false);
    if (ok === null) { setReceiptError("Save failed."); return; }
    setReceiptSaved(true);
    autoResetSaved(setReceiptSaved);
  }

  async function createCoupon() {
    if (couponSaving) return;
    setCouponError("");
    var code = couponForm.code.trim().toUpperCase();
    var pct = parseInt(couponForm.discount_pct, 10);
    if (!code) { setCouponError("Enter a code."); return; }
    if (isNaN(pct) || pct <= 0 || pct > 100) { setCouponError("Enter a whole number between 1 and 100."); return; }
    if (coupons.some(function (c) { return c.code === code; })) { setCouponError("That code already exists."); return; }

    setCouponSaving(true);
    var ok = await db("POST", "auto_coupons", {
      salon_id: salon.id, code: code, discount_pct: pct,
      expires_at: couponForm.expires_at ? new Date(couponForm.expires_at + "T23:59:59").toISOString() : null,
      active: true,
    });
    setCouponSaving(false);
    if (ok === null) { setCouponError("Save failed."); return; }
    setCouponForm({ code: "", discount_pct: "", expires_at: "" });
    setShowCouponEditor(false);
    loadCoupons();
  }

  async function toggleCouponActive(coupon) {
    await db("PATCH", "auto_coupons", { active: !coupon.active }, "?id=eq." + coupon.id);
    loadCoupons();
  }

  // ── Subscription -- ported from SalonSettingsPage ────────────────────
  // Read-only display + plan prices from the public subscription_plans
  // table (apikey-only fetch, no auth needed, matches source exactly)
  // and a mailto-based manual payment-notification flow -- no direct
  // subscription writes from the client at all, same as the source.
  var [selectedPlan, setSelectedPlan] = useState("");
  var [planPrices, setPlanPrices] = useState(null);

  function fetchPlanPrices() {
    fetch(SUPABASE_URL + "/rest/v1/subscription_plans?order=sort_order.asc", {
      headers: { apikey: SUPABASE_KEY },
    })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        var map = {};
        rows.forEach(function (r) { map[r.key] = r; });
        setPlanPrices(map);
      })
      .catch(function () {});
  }

  useEffect(function () {
    fetchPlanPrices();
    window.addEventListener("focus", fetchPlanPrices);
    return function () { window.removeEventListener("focus", fetchPlanPrices); };
  }, []);

  // ── M-Pesa STK Push (Daraja) fields -- ported from SalonSettingsPage ──
  var [mpesaConfigId, setMpesaConfigId] = useState(null);
  var [hasSavedStkCreds, setHasSavedStkCreds] = useState(false);
  var [consumerKey, setConsumerKey] = useState("");
  var [consumerSecret, setConsumerSecret] = useState(""); // write-only, never re-fetched
  var [stkShortcode, setStkShortcode] = useState("");
  var [transactionType, setTransactionType] = useState("CustomerBuyGoodsOnline");
  var [stkSaving, setStkSaving] = useState(false);
  var [stkSaved, setStkSaved] = useState(false);
  var [stkError, setStkError] = useState("");

  useEffect(function () {
    if (!salon || !salon.id) return;
    (async function () {
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

  // ── Contact & Payments fields -- ported from SalonSettingsPage ──────
  // Fetched directly from salon_settings rather than relying on
  // useSalon() context, consistent with the M-Pesa STK section above --
  // context's merge (see SalonContext.jsx) doesn't include
  // receipt_footer, so a dedicated fetch keeps every field here sourced
  // the same way rather than mixing context + fetch for related fields.
  var [contactPhone, setContactPhone] = useState("");
  var [mpesaTill, setMpesaTill] = useState("");
  var [mpesaName, setMpesaName] = useState("");
  var [mpesaPaybill, setMpesaPaybill] = useState("");
  var [mpesaAccount, setMpesaAccount] = useState("");
  var [mpesaSendMoneyPhone, setMpesaSendMoneyPhone] = useState("");
  // "Card" is a new value added here per explicit direction -- a
  // recordable/manual payment method label only, same as how Till/
  // Paybill/Send Money already work in POS's own checkout (shown as
  // instructions, not real processing). No schema change needed:
  // enabled_payment_methods is a plain text[] with no CHECK constraint
  // (confirmed live before adding this), so "Card" is just a new string
  // value, not a new column or migration.
  var [enabledPaymentMethods, setEnabledPaymentMethods] = useState(["Cash", "Till"]);
  var [receiptFooter, setReceiptFooter] = useState("");
  var [contactSaving, setContactSaving] = useState(false);
  var [contactSaved, setContactSaved] = useState(false);
  var [contactError, setContactError] = useState("");

  useEffect(function () {
    if (!salon || !salon.id) return;
    (async function () {
      var rows = await db("GET", "salon_settings", null, "?salon_id=eq." + salon.id + "&limit=1");
      var s = rows && rows[0];
      if (!s) return;
      setContactPhone(s.contact_phone || "");
      setMpesaTill(s.mpesa_till || "");
      setMpesaName(s.mpesa_name || "");
      setMpesaPaybill(s.mpesa_paybill || "");
      setMpesaAccount(s.mpesa_account || "");
      setMpesaSendMoneyPhone(s.mpesa_send_money_phone || "");
      setEnabledPaymentMethods(s.enabled_payment_methods || ["Cash", "Till"]);
      setReceiptFooter(s.receipt_footer || "");
    })();
  }, [salon && salon.id]);

  function togglePaymentMethod(method) {
    setEnabledPaymentMethods(function (prev) {
      if (method === "Cash") return prev; // Cash always stays
      return prev.includes(method)
        ? prev.filter(function (m) { return m !== method; })
        : prev.concat(method);
    });
    setContactSaved(false);
  }

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
      contact_phone: contactPhone || null,
      mpesa_till: mpesaTill || null,
      mpesa_name: mpesaName || null,
      mpesa_paybill: mpesaPaybill || null,
      mpesa_account: mpesaAccount || null,
      mpesa_send_money_phone: mpesaSendMoneyPhone || null,
      enabled_payment_methods: enabledPaymentMethods,
      receipt_footer: receiptFooter || null,
    }, "?salon_id=eq." + (salon && salon.id));
    setContactSaving(false);
    if (ok === null) { setContactError("Save failed. Check your connection."); return; }
    setContactSaved(true);
    autoResetSaved(setContactSaved);
  }

  // ── PIN fields -- ported from SalonSettingsPage, identical RPC call ──
  var [newStaffPin, setNewStaffPin] = useState("");
  var [newAdminPin, setNewAdminPin] = useState("");
  var [confirmAdminPin, setConfirmAdminPin] = useState("");
  var [pinSaving, setPinSaving] = useState(false);
  var [pinSaved, setPinSaved] = useState(false);
  var [pinError, setPinError] = useState("");

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

    var token = await getValidAccessToken();
    var rpcUpdates = [];
    if (newStaffPin) {
      rpcUpdates.push(fetch(SUPABASE_URL + "/rest/v1/rpc/update_salon_pin", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + (token || SUPABASE_KEY), "Content-Type": "application/json" },
        body: JSON.stringify({ p_role: "staff", p_new_pin: newStaffPin }),
      }));
    }
    if (newAdminPin) {
      rpcUpdates.push(fetch(SUPABASE_URL + "/rest/v1/rpc/update_salon_pin", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + (token || SUPABASE_KEY), "Content-Type": "application/json" },
        body: JSON.stringify({ p_role: "admin", p_new_pin: newAdminPin }),
      }));
    }

    var results = await Promise.all(rpcUpdates);
    setPinSaving(false);

    var anyFailed = results.some(function (r) { return !r.ok; });
    if (anyFailed) {
      setPinError("PIN update failed. Please try again.");
      return;
    }

    setPinSaved(true);
    setNewStaffPin(""); setNewAdminPin(""); setConfirmAdminPin("");
    autoResetSaved(setPinSaved);
  }

  return (
    <div style={{ minHeight: "100vh", background: INK, fontFamily: "system-ui, -apple-system, sans-serif", paddingBottom: 40 }}>
      <div style={{ padding: "20px 20px 4px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: PAPER }}>Settings</div>
        <div style={{ fontSize: 12, color: CHROME, marginTop: 2 }}>
          Branding, Contact & Payments, M-Pesa, PIN Management, Business Info, Preferences, Referrals, Tax (VAT), Receipt, Coupons, Subscription.
        </div>
      </div>
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>

        {/* ── BRANDING ─────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>🎨</span> Branding</div>

          <Field label="Business Display Name">
            <input value={salonDisplayName} onChange={function (e) { setSalonDisplayName(e.target.value); setBrandingSaved(false); }}
              placeholder="High Point Carwash" style={inputStyle} />
          </Field>

          <Field label="Tagline">
            <input value={tagline} onChange={function (e) { setTagline(e.target.value); setBrandingSaved(false); }}
              placeholder="Where your car meets its shine" style={inputStyle} />
          </Field>

          <Field label="Logo URL">
            <input value={logoUrl} onChange={function (e) { setLogoUrl(e.target.value); setBrandingSaved(false); }}
              placeholder="https://your-site.com/logo.png" style={inputStyle} />
            {logoUrl && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <img src={logoUrl} alt="Logo preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "contain", border: "1px solid " + CHROME + "44", background: PAPER }}
                  onError={function (e) { e.target.style.display = "none"; }} />
                <span style={{ fontSize: 11, color: CHROME }}>Logo preview</span>
              </div>
            )}
          </Field>

          <ColorPicker label="Primary Color (used on receipts)" value={primaryColor} onChange={function (v) { setPrimaryColor(v); setBrandingSaved(false); }} />
          <ColorPicker label="Secondary Color" value={secondaryColor} onChange={function (v) { setSecondaryColor(v); setBrandingSaved(false); }} />

          <div style={{ fontSize: 10, color: CHROME, marginBottom: 12, lineHeight: 1.5 }}>
            These colors don't change the look of this app — Auto keeps its own fixed theme throughout. Primary Color does show up on your Auto receipts (via the shared brandmark), same as it does on POS's.
          </div>

          {brandingError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{brandingError}</div>}
          <SaveBtn onClick={saveBranding} saving={brandingSaving} saved={brandingSaved} />
        </div>

        {/* ── CONTACT & PAYMENTS ───────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>💳</span> Contact & Payments</div>

          <Field label="Contact Phone">
            <input value={contactPhone} onChange={function (e) { setContactPhone(e.target.value); setContactSaved(false); }} placeholder="0712345678" style={inputStyle} />
          </Field>

          <Field label="M-Pesa Till Number">
            <input value={mpesaTill} onChange={function (e) { setMpesaTill(e.target.value); setContactSaved(false); }} placeholder="5927571" style={inputStyle} />
          </Field>

          <Field label="M-Pesa Registered Name">
            <input value={mpesaName} onChange={function (e) { setMpesaName(e.target.value); setContactSaved(false); }} placeholder="Business name on M-Pesa" style={inputStyle} />
          </Field>

          <Field label="Paybill Number">
            <input value={mpesaPaybill} onChange={function (e) { setMpesaPaybill(e.target.value); setContactSaved(false); }} placeholder="Optional" style={inputStyle} />
          </Field>

          <Field label="Paybill Account Number">
            <input value={mpesaAccount} onChange={function (e) { setMpesaAccount(e.target.value); setContactSaved(false); }} placeholder="Optional" style={inputStyle} />
          </Field>

          <Field label="Send Money Phone Number">
            <input value={mpesaSendMoneyPhone} onChange={function (e) { setMpesaSendMoneyPhone(e.target.value); setContactSaved(false); }} placeholder="Optional, 0712345678" style={inputStyle} />
          </Field>

          <Field label="Payment Methods at Checkout">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["Cash", "Till", "Paybill", "Send Money", "Card"].map(function (m) {
                var isOn = enabledPaymentMethods.includes(m);
                var isCash = m === "Cash";
                return (
                  <button key={m} onClick={function () { togglePaymentMethod(m); }} disabled={isCash}
                    style={{
                      padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: "1.5px solid " + (isOn ? SIGNAL : CHROME + "55"),
                      background: isOn ? SIGNAL + "22" : "transparent",
                      color: isOn ? SIGNAL : CHROME,
                      cursor: isCash ? "default" : "pointer", opacity: isCash ? 0.7 : 1,
                    }}>
                    {m}{isCash ? " (always on)" : ""}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: CHROME, marginTop: 6 }}>
              Till still triggers a real M-Pesa payment prompt if STK Push is set up below. Paybill, Send Money, and Card are recorded manually at checkout — staff marks the job paid by that method, nothing is verified automatically.
            </div>
          </Field>

          <Field label="Receipt Footer">
            <textarea value={receiptFooter} onChange={function (e) { setReceiptFooter(e.target.value); setContactSaved(false); }}
              placeholder="e.g. Thank you for choosing us!" rows={2}
              style={Object.assign({}, inputStyle, { resize: "vertical" })} />
          </Field>

          {contactError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{contactError}</div>}
          <SaveBtn onClick={saveContact} saving={contactSaving} saved={contactSaved} />
        </div>

        {/* ── M-PESA STK PUSH ──────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>📲</span> M-Pesa STK Push</div>
          <div style={{ fontSize: 11, color: CHROME, marginBottom: 14, marginTop: -8 }}>
            {hasSavedStkCreds
              ? "Connected. Customers get a real payment prompt on their phone at checkout."
              : "Not connected yet — checkout falls back to manual till payment until this is set up."}
            {" "}Get these from your own Safaricom Daraja app at developer.safaricom.co.ke.
          </div>

          <Field label="Shortcode / Till Number">
            <input value={stkShortcode} onChange={function (e) { setStkShortcode(e.target.value); setStkSaved(false); }} placeholder="5927571" style={inputStyle} />
          </Field>

          <Field label="Transaction Type">
            <select value={transactionType} onChange={function (e) { setTransactionType(e.target.value); setStkSaved(false); }} style={inputStyle}>
              <option value="CustomerBuyGoodsOnline">Till Number (Buy Goods)</option>
              <option value="CustomerPayBillOnline">Paybill</option>
            </select>
          </Field>

          <Field label="Consumer Key">
            <input value={consumerKey} onChange={function (e) { setConsumerKey(e.target.value); setStkSaved(false); }} placeholder="From your Daraja app" style={inputStyle} />
          </Field>

          <Field label="Consumer Secret">
            <input type="password" value={consumerSecret} onChange={function (e) { setConsumerSecret(e.target.value); setStkSaved(false); }}
              placeholder={hasSavedStkCreds ? "•••••••• (leave blank to keep current)" : "From your Daraja app"} style={inputStyle} />
            <div style={{ fontSize: 10, color: CHROME, marginTop: 4 }}>Never shown again once saved, for safety — leave blank unless changing it.</div>
          </Field>

          {stkError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{stkError}</div>}
          <SaveBtn onClick={saveStkConfig} saving={stkSaving} saved={stkSaved} />
        </div>

        {/* ── PREFERENCES ──────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>🌍</span> Preferences</div>
          <div style={{ fontSize: 10, color: CHROME, marginBottom: 12, marginTop: -8 }}>
            Currently only affects POS's own display — Auto's own screens hardcode KSh and don't yet read this.
          </div>

          <Field label="Currency Symbol">
            <select value={currency} onChange={function (e) { setCurrency(e.target.value); setPrefSaved(false); }} style={inputStyle}>
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
            <select value={timezone} onChange={function (e) { setTimezone(e.target.value); setPrefSaved(false); }} style={inputStyle}>
              <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
              <option value="Africa/Kampala">Africa/Kampala (EAT, UTC+3)</option>
              <option value="Africa/Dar_es_Salaam">Africa/Dar es Salaam (EAT, UTC+3)</option>
              <option value="Africa/Kigali">Africa/Kigali (CAT, UTC+2)</option>
              <option value="Africa/Addis_Ababa">Africa/Addis Ababa (EAT, UTC+3)</option>
              <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>

          {prefError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{prefError}</div>}
          <SaveBtn onClick={savePreferences} saving={prefSaving} saved={prefSaved} />
        </div>

        {/* ── REFERRALS ────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>🤝</span> Referrals</div>
          <div style={{ fontSize: 10, color: CHROME, marginBottom: 12, marginTop: -8 }}>
            When staff record "Referred by" at Check-In, both the referrer (on their next visit)
            and the new customer (on this first visit) automatically get this % off — no extra
            step needed at checkout. Changing this only affects referrals recorded from now on.
          </div>

          <Field label="Reward (%)">
            <input type="number" min="0" max="100" value={referralPct}
              onChange={function (e) { setReferralPct(e.target.value); setReferralSaved(false); }} style={inputStyle} />
          </Field>

          {referralError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{referralError}</div>}
          <SaveBtn onClick={saveReferralPct} saving={referralSaving} saved={referralSaved} />
        </div>

        {/* ── TAX (VAT) ────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>🧾</span> Tax (VAT)</div>
          <div style={{ fontSize: 10, color: CHROME, marginBottom: 12, marginTop: -8 }}>
            Prices are treated as VAT-inclusive — this only affects what's shown on receipts and
            in Reports, never what's actually charged at checkout.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <input type="checkbox" checked={taxEnabled}
              onChange={function (e) { setTaxEnabled(e.target.checked); setTaxSaved(false); }}
              style={{ width: 18, height: 18, cursor: "pointer" }} />
            <span style={{ fontSize: 13, color: PAPER, fontWeight: 700 }}>Show VAT breakdown on receipts</span>
          </div>

          {taxEnabled && (
            <>
              <Field label="VAT Rate (%)">
                <input type="number" min="0" max="100" value={taxRate}
                  onChange={function (e) { setTaxRate(e.target.value); setTaxSaved(false); }} style={inputStyle} />
              </Field>

              <Field label="KRA PIN (optional)">
                <input value={taxPin} onChange={function (e) { setTaxPin(e.target.value); setTaxSaved(false); }}
                  placeholder="e.g. P051234567X" style={inputStyle} />
              </Field>
            </>
          )}

          {taxError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{taxError}</div>}
          <SaveBtn onClick={saveTaxSettings} saving={taxSaving} saved={taxSaved} />
        </div>

        {/* ── RECEIPT ──────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>🧻</span> Receipt</div>

          <Field label="Footer message (optional)">
            <input value={receiptFooter}
              onChange={function (e) { setReceiptFooter(e.target.value); setReceiptSaved(false); }}
              placeholder="e.g. Thank you, see you again!" style={inputStyle} />
          </Field>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <input type="checkbox" checked={receiptShowStaff}
              onChange={function (e) { setReceiptShowStaff(e.target.checked); setReceiptSaved(false); }}
              style={{ width: 18, height: 18, cursor: "pointer" }} />
            <span style={{ fontSize: 13, color: PAPER, fontWeight: 700 }}>Show staff name</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <input type="checkbox" checked={receiptShowVehicle}
              onChange={function (e) { setReceiptShowVehicle(e.target.checked); setReceiptSaved(false); }}
              style={{ width: 18, height: 18, cursor: "pointer" }} />
            <span style={{ fontSize: 13, color: PAPER, fontWeight: 700 }}>Show vehicle details</span>
          </div>

          {receiptError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{receiptError}</div>}
          <SaveBtn onClick={saveReceiptSettings} saving={receiptSaving} saved={receiptSaved} />
        </div>

        {/* ── COUPONS ──────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: coupons.length > 0 || showCouponEditor ? 10 : 0 }}>
            <div style={sectionTitleStyle}><span>🎟️</span> Coupons</div>
            <div onClick={function () { setShowCouponEditor(!showCouponEditor); setCouponError(""); }} style={{ fontSize: 12, color: SIGNAL, fontWeight: 700, cursor: "pointer" }}>
              {showCouponEditor ? "Cancel" : "+ New Coupon"}
            </div>
          </div>

          {showCouponEditor && (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: "1px solid " + CHROME + "22", background: "rgba(255,255,255,0.02)" }}>
              <input value={couponForm.code}
                onChange={function (e) { setCouponForm(Object.assign({}, couponForm, { code: e.target.value.toUpperCase() })); }}
                placeholder="CODE (e.g. WELCOME10)"
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13, marginBottom: 8, textTransform: "uppercase" }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="number" value={couponForm.discount_pct}
                  onChange={function (e) { setCouponForm(Object.assign({}, couponForm, { discount_pct: e.target.value })); }}
                  placeholder="% off"
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
                <input type="date" value={couponForm.expires_at}
                  onChange={function (e) { setCouponForm(Object.assign({}, couponForm, { expires_at: e.target.value })); }}
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
              </div>
              <div style={{ fontSize: 10, color: CHROME, marginBottom: 8 }}>Leave the date blank for a coupon that never expires.</div>
              {couponError && <div style={{ fontSize: 12, color: ALERT, marginBottom: 8 }}>{couponError}</div>}
              <button onClick={createCoupon} disabled={couponSaving} style={{
                width: "100%", background: SIGNAL, color: INK, border: "none", borderRadius: 8, padding: "10px",
                fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: couponSaving ? 0.6 : 1,
              }}>
                Create coupon
              </button>
            </div>
          )}

          {coupons.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {coupons.map(function (c) {
                var expired = c.expires_at && new Date(c.expires_at) < new Date();
                return (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", opacity: (c.active && !expired) ? 1 : 0.5 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: PAPER, fontFamily: "monospace" }}>{c.code}</div>
                      <div style={{ fontSize: 10, color: CHROME }}>
                        {c.discount_pct}% off{c.expires_at ? " · expires " + new Date(c.expires_at).toLocaleDateString("en-KE") : " · no expiry"}
                        {expired ? " (expired)" : ""}
                      </div>
                    </div>
                    <span onClick={function () { toggleCouponActive(c); }} style={{ fontSize: 10, color: CHROME, textDecoration: "underline", cursor: "pointer" }}>
                      {c.active ? "Deactivate" : "Reactivate"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── SUBSCRIPTION ─────────────────────────────────────── */}
        <div style={Object.assign({}, sectionStyle, { background: "#2A2410", border: "1.5px solid #92400E55" })}>
          <div style={sectionTitleStyle}><span>💳</span> Subscription</div>

          {salon && salon.subscription_plan ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: PAPER, textTransform: "capitalize" }}>
                    {(salon.subscription_plan || "").replace("_", " ")} Plan
                  </div>
                  <div style={{ fontSize: 11, color: CHROME, marginTop: 2 }}>
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
                  background: salon.subscription_status === "lifetime" ? "#FCD34D22" :
                    salon.subscription_status === "active" ? "#22C55E22" :
                    salon.subscription_status === "grace" ? "#F59E0B22" : ALERT + "22",
                  color: salon.subscription_status === "lifetime" ? "#FCD34D" :
                    salon.subscription_status === "active" ? "#22C55E" :
                    salon.subscription_status === "grace" ? "#F59E0B" : ALERT,
                  borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                }}>
                  {salon.subscription_status || "active"}
                </div>
              </div>
              {salon.subscription_grace && (
                <div style={{ background: "#F59E0B22", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#F59E0B", marginTop: 8 }}>
                  ⏰ Grace period: {salon.subscription_days_overdue} day{salon.subscription_days_overdue !== 1 ? "s" : ""} overdue.
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: CHROME, marginBottom: 14 }}>No active subscription. Choose a plan below to get started.</div>
          )}

          {salon && salon.subscription_status !== "lifetime" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", marginBottom: 8 }}>
                {salon.subscription_plan ? "Renew or Upgrade" : "Choose a Plan"}
              </div>
              {planPrices === null ? (
                <div style={{ fontSize: 12, color: CHROME, padding: "10px 0" }}>Loading plans...</div>
              ) : (
                Object.values(planPrices).map(function (plan) {
                  return (
                    <div key={plan.key} onClick={function () { setSelectedPlan(plan.key === selectedPlan ? "" : plan.key); }} style={{
                      background: selectedPlan === plan.key ? "#FCD34D18" : "rgba(255,255,255,0.03)",
                      border: "1.5px solid " + (selectedPlan === plan.key ? "#FCD34D" : CHROME + "33"),
                      borderRadius: 10, padding: "10px 14px", marginBottom: 8,
                      cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: PAPER }}>{plan.label}</div>
                        <div style={{ fontSize: 11, color: CHROME }}>{plan.period_days ? plan.period_days + " days" : "Forever"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#FCD34D" }}>KES {plan.price_kes.toLocaleString()}</div>
                        {plan.save_label && <div style={{ fontSize: 10, color: "#22C55E", fontWeight: 700 }}>{plan.save_label}</div>}
                      </div>
                    </div>
                  );
                })
              )}

              {selectedPlan && (
                <div style={{ background: "#22C55E18", border: "1.5px solid #22C55E55", borderRadius: 12, padding: 14, marginTop: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#22C55E", marginBottom: 8 }}>Pay via M-Pesa to activate</div>
                  <div style={{ fontSize: 12, color: "#86EFAC", marginBottom: 4 }}>📱 <b>Lipa na M-Pesa → Buy Goods</b></div>
                  <div style={{ fontSize: 12, color: "#86EFAC", marginBottom: 4 }}>Till Number: <b style={{ fontSize: 14 }}>— Contact admin —</b></div>
                  <div style={{ fontSize: 12, color: "#86EFAC", marginBottom: 10 }}>
                    Amount: <b>KES {planPrices && planPrices[selectedPlan] ? planPrices[selectedPlan].price_kes.toLocaleString() : "—"}</b>
                  </div>
                  <div style={{ fontSize: 11, color: CHROME, lineHeight: 1.6, marginBottom: 10 }}>
                    After payment, send your M-Pesa confirmation SMS screenshot to <b>admin@trimorasystems.com</b> or WhatsApp us. We'll activate your subscription within 2 hours.
                  </div>
                  <a href={"mailto:admin@trimorasystems.com?subject=Subscription Payment — " + (salon && salon.name) + "&body=Hi Trimora Team,%0D%0A%0D%0AI have made a payment for the " + selectedPlan.replace("_", " ") + " plan.%0D%0A%0D%0ASalon: " + (salon && salon.name) + "%0D%0APlan: " + selectedPlan.replace("_", " ") + "%0D%0A%0D%0APlease find my M-Pesa confirmation attached.%0D%0A%0D%0AThank you."}
                    style={{ display: "block", background: "#22C55E", color: INK, borderRadius: 10, padding: "11px 0", fontWeight: 900, fontSize: 13, textAlign: "center", textDecoration: "none" }}>
                    📧 Notify Trimora of Payment
                  </a>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 11, color: "#F59E0B", lineHeight: 1.5 }}>
            Questions? Contact: <a href="mailto:admin@trimorasystems.com" style={{ color: "#FCD34D", fontWeight: 800 }}>admin@trimorasystems.com</a>
          </div>
        </div>

        {/* ── PIN MANAGEMENT ───────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><span>🔐</span> PIN Management</div>
          <div style={{ fontSize: 11, color: CHROME, marginBottom: 14, lineHeight: 1.5 }}>
            Leave a PIN field blank to keep the current PIN unchanged. Admin PIN change requires confirmation.
          </div>

          <Field label="New Staff PIN (4–6 digits)">
            <input type="password" inputMode="numeric" value={newStaffPin}
              onChange={function (e) { setNewStaffPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinSaved(false); }}
              placeholder="Leave blank to keep current" maxLength={6} style={inputStyle} />
          </Field>

          <Field label="New Admin PIN (4–6 digits)">
            <input type="password" inputMode="numeric" value={newAdminPin}
              onChange={function (e) { setNewAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinSaved(false); }}
              placeholder="Leave blank to keep current" maxLength={6} style={inputStyle} />
          </Field>

          {newAdminPin.length > 0 && (
            <Field label="Confirm New Admin PIN">
              <input type="password" inputMode="numeric" value={confirmAdminPin}
                onChange={function (e) { setConfirmAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinSaved(false); }}
                placeholder="Re-enter admin PIN" maxLength={6}
                style={Object.assign({}, inputStyle, { borderColor: confirmAdminPin.length > 0 && confirmAdminPin !== newAdminPin ? ALERT : CHROME + "55" })} />
            </Field>
          )}

          {pinError && <div style={{ color: ALERT, fontSize: 12, marginBottom: 8, padding: "6px 10px", background: ALERT + "18", borderRadius: 8 }}>{pinError}</div>}
          <SaveBtn onClick={savePins} saving={pinSaving} saved={pinSaved} disabled={!newStaffPin && !newAdminPin} />
        </div>

        {/* ── SALON INFO ───────────────────────────────────────── */}
        <div style={Object.assign({}, sectionStyle, { background: "rgba(255,255,255,0.03)" })}>
          <div style={sectionTitleStyle}><span>ℹ️</span> Business Info</div>
          <div style={{ fontSize: 12, color: CHROME, lineHeight: 1.8 }}>
            <div><b style={{ color: PAPER }}>Salon ID:</b> <span style={{ fontFamily: "monospace", fontSize: 11 }}>{salon && salon.id}</span></div>
            <div><b style={{ color: PAPER }}>Slug:</b> <span style={{ fontFamily: "monospace", fontSize: 11 }}>{salon && salon.slug}</span></div>
            <div><b style={{ color: PAPER }}>Auto URL:</b> <a href={"/" + (salon && salon.slug) + "/auto"} target="_blank" rel="noreferrer" style={{ color: SIGNAL, fontSize: 11 }}>/{salon && salon.slug}/auto</a></div>
          </div>
        </div>

      </div>
    </div>
  );
}
