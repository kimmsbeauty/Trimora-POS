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

import { useState, useEffect } from "react";
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

function autoResetSaved(setter) {
  setTimeout(function () { setter(false); }, 3000);
}

export default function AutoSettingsPage() {
  var salon = useSalon();

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
          Branding, Preferences, and Subscription coming in a follow-up pass.
        </div>
      </div>
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>

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
