// src/pages/auto/CheckInPage.jsx
//
// The first Trimora Auto screen: creates an auto_jobs row (plus its
// customer/vehicle if new, and its line items) -- everything else in
// Auto (queue board, bay board) will read from what this screen writes.
// Bay assignment deliberately does NOT happen here -- a job is created
// in 'waiting' status with no bay_id, and gets assigned once a queue/bay
// screen exists to do that assignment deliberately, not implicitly at
// intake.

import { useState, useEffect } from "react";
import { useSalon } from "../../lib/SalonContext";
import { db } from "../../lib/db";
import LoyaltyBadge from "../../components/LoyaltyBadge";
import VehiclePhotoUpload from "../../components/VehiclePhotoUpload";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

function normalizeReg(raw) {
  return (raw || "").toUpperCase().replace(/\s+/g, "");
}

function money(n) {
  return "KSh " + (n || 0).toLocaleString();
}

export default function CheckInPage() {
  var salon = useSalon();

  var servicesState = useState([]);
  var services = servicesState[0]; var setServices = servicesState[1];

  var regInputState = useState("");
  var regInput = regInputState[0]; var setRegInput = regInputState[1];

  var searchStatusState = useState("idle"); // idle | searching | found | not_found
  var searchStatus = searchStatusState[0]; var setSearchStatus = searchStatusState[1];

  var vehicleState = useState(null); // resolved { id, customer_id, customers: {...} }
  var vehicle = vehicleState[0]; var setVehicle = vehicleState[1];

  var custNameState = useState(""); var custName = custNameState[0]; var setCustName = custNameState[1];
  var custPhoneState = useState(""); var custPhone = custPhoneState[0]; var setCustPhone = custPhoneState[1];
  var vMakeState = useState(""); var vMake = vMakeState[0]; var setVMake = vMakeState[1];
  var vModelState = useState(""); var vModel = vModelState[0]; var setVModel = vModelState[1];
  var vColorState = useState(""); var vColor = vColorState[0]; var setVColor = vColorState[1];

  // Referral: only offered on the not_found (brand-new customer) path,
  // matching "the new customer's reward applies on this first visit."
  // Deliberately a separate explicit phone lookup rather than a live
  // search-as-you-type, so staff get a clear name confirmation before
  // it's attached -- same reasoning as the reg-number vehicle search
  // above, just for a person instead of a car.
  var referrerPhoneState = useState(""); var referrerPhone = referrerPhoneState[0]; var setReferrerPhone = referrerPhoneState[1];
  var referrerState = useState(null); // resolved { id, name } | null
  var referrer = referrerState[0]; var setReferrer = referrerState[1];
  var referrerSearchStatusState = useState("idle"); // idle | searching | found | not_found
  var referrerSearchStatus = referrerSearchStatusState[0]; var setReferrerSearchStatus = referrerSearchStatusState[1];

  var selectedState = useState({}); // { [service.id]: true }
  var selected = selectedState[0]; var setSelected = selectedState[1];

  var submittingState = useState(false);
  var submitting = submittingState[0]; var setSubmitting = submittingState[1];

  var resultState = useState(null); // null | "success" | "error"
  var result = resultState[0]; var setResult = resultState[1];

  // Only used for the optional "add photos" section on the success
  // screen -- a new vehicle's id doesn't exist until check-in is
  // actually submitted, so it can't be shown any earlier for that path.
  var lastVehicleIdState = useState(null);
  var lastVehicleId = lastVehicleIdState[0]; var setLastVehicleId = lastVehicleIdState[1];

  useEffect(function () {
    db("GET", "auto_services", null, "?active=eq.true&order=name.asc").then(function (rows) {
      setServices(rows || []);
    });
  }, []);

  function resetForm() {
    setRegInput(""); setSearchStatus("idle"); setVehicle(null);
    setCustName(""); setCustPhone(""); setVMake(""); setVModel(""); setVColor("");
    setSelected({}); setResult(null); setLastVehicleId(null);
    setReferrerPhone(""); setReferrer(null); setReferrerSearchStatus("idle");
  }

  async function handleReferrerSearch() {
    var phone = referrerPhone.trim();
    if (!phone) return;
    setReferrerSearchStatus("searching");
    var rows = await db("GET", "customers", null, "?phone=eq." + encodeURIComponent(phone) + "&limit=1");
    if (rows && rows.length > 0) {
      setReferrer(rows[0]);
      setReferrerSearchStatus("found");
    } else {
      setReferrer(null);
      setReferrerSearchStatus("not_found");
    }
  }

  async function handleSearch() {
    var reg = normalizeReg(regInput);
    if (!reg) return;
    setSearchStatus("searching");
    var rows = await db("GET", "auto_vehicles", null,
      "?reg_number=eq." + encodeURIComponent(reg) + "&select=*,customers(id,name,phone,visit_count,total_spend)");
    if (rows && rows.length > 0) {
      setVehicle(rows[0]);
      setSearchStatus("found");
    } else {
      setVehicle(null);
      setSearchStatus("not_found");
    }
  }

  function toggleService(id) {
    setSelected(function (prev) {
      var next = Object.assign({}, prev);
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  }

  var selectedServices = services.filter(function (s) { return selected[s.id]; });
  var total = selectedServices.reduce(function (sum, s) { return sum + (s.price || 0); }, 0);

  var readyToSubmit =
    searchStatus === "found" ||
    (searchStatus === "not_found" && custName.trim() && custPhone.trim());
  var canSubmit = readyToSubmit && selectedServices.length > 0 && !submitting;

  async function handleCheckIn() {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);

    var customerId = null;
    var vehicleId = null;

    if (searchStatus === "found" && vehicle) {
      customerId = vehicle.customer_id;
      vehicleId = vehicle.id;
    } else {
      var savedCustomer = await db("POST", "customers", {
        name: custName.trim(), phone: custPhone.trim(),
      });
      if (!savedCustomer || !savedCustomer[0]) { setSubmitting(false); setResult("error"); return; }
      customerId = savedCustomer[0].id;

      var savedVehicle = await db("POST", "auto_vehicles", {
        customer_id: customerId,
        reg_number: normalizeReg(regInput),
        make: vMake.trim() || null,
        model: vModel.trim() || null,
        color: vColor.trim() || null,
      });
      if (!savedVehicle || !savedVehicle[0]) { setSubmitting(false); setResult("error"); return; }
      vehicleId = savedVehicle[0].id;
    }

    var savedJob = await db("POST", "auto_jobs", {
      customer_id: customerId,
      vehicle_id: vehicleId,
      status: "waiting",
      total_price: total,
    });
    if (!savedJob || !savedJob[0]) { setSubmitting(false); setResult("error"); return; }
    var job = savedJob[0];

    var lineItems = selectedServices.map(function (s) {
      return { job_id: job.id, auto_service_id: s.id, price: s.price };
    });
    await db("POST", "auto_job_services", lineItems);

    await db("POST", "auto_job_events", {
      job_id: job.id,
      event_type: "checked_in",
      payload: { vehicle_id: vehicleId, service_count: selectedServices.length, total_price: total },
    });

    // Referral: only possible on the not_found (brand-new customer) path
    // -- referrerSearchStatus === "found" guarantees a resolved customer
    // id, distinct from the newly-created one (an existing customer can't
    // refer themselves; the phone-lookup UI also only appears pre-submit
    // for new customers, so this can't fire on a returning-customer visit
    // at all). A failure here doesn't roll back or block the check-in --
    // the queue/job creation above is the important part; a referral not
    // recording is recoverable, a stuck check-in isn't.
    if (searchStatus === "not_found" && referrerSearchStatus === "found" && referrer) {
      await db("POST", "auto_referrals", {
        salon_id: salon.id,
        referrer_customer_id: referrer.id,
        referred_customer_id: customerId,
        reward_pct: (salon && salon.referral_reward_pct != null) ? salon.referral_reward_pct : 10,
        referred_job_id: job.id,
      });
    }

    setSubmitting(false);
    setLastVehicleId(vehicleId);
    setResult("success");
  }

  var panelStyle = {
    background: STEEL, borderRadius: 14, padding: 20, marginBottom: 16,
    border: "1px solid rgba(143,166,184,0.15)",
  };
  var labelStyle = {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
    color: CHROME, marginBottom: 8, display: "block",
  };
  var inputStyle = {
    width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1.5px solid rgba(143,166,184,0.25)",
    background: "rgba(255,255,255,0.04)", padding: "12px 14px", fontSize: 15, color: PAPER,
    outline: "none", fontFamily: "inherit",
  };

  if (result === "success") {
    return (
      <div style={{ minHeight: "100vh", background: INK, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: PAPER, marginBottom: 6 }}>Checked in</div>
        <div style={{ fontSize: 13, color: CHROME, marginBottom: 20, textAlign: "center" }}>
          Vehicle is now waiting in the queue.
        </div>
        {lastVehicleId && (
          <div style={{ width: "100%", maxWidth: 380, background: STEEL, borderRadius: 14, padding: 16, marginBottom: 20, border: "1px solid rgba(143,166,184,0.15)" }}>
            <VehiclePhotoUpload vehicleId={lastVehicleId} />
          </div>
        )}
        <button onClick={resetForm} style={{
          background: SIGNAL, color: INK, border: "none", borderRadius: 12, padding: "14px 28px",
          fontSize: 15, fontWeight: 800, cursor: "pointer",
        }}>
          Check in another vehicle
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: INK, fontFamily: "system-ui, -apple-system, sans-serif",
      paddingBottom: 100 }}>
      <div style={{ padding: "20px 20px 4px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
          color: CHROME, marginBottom: 2 }}>
          {(salon && salon.name) || "Trimora Auto"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: PAPER }}>Check In</div>
      </div>

      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>

        {/* Step 1: plate lookup -- the signature element */}
        <div style={panelStyle}>
          <span style={labelStyle}>Registration Number</span>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{
              flex: 1, display: "flex", alignItems: "stretch", borderRadius: 10,
              border: "2px solid " + SIGNAL, overflow: "hidden", background: "rgba(61,220,151,0.06)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px",
                fontSize: 9, fontWeight: 800, color: SIGNAL, letterSpacing: "0.05em",
                borderRight: "2px solid " + SIGNAL, writingMode: "vertical-rl",
              }}>
                KE
              </div>
              <input
                value={regInput}
                onChange={function (e) { setRegInput(e.target.value); }}
                onKeyDown={function (e) { if (e.key === "Enter") handleSearch(); }}
                placeholder="KAA 123X"
                style={{
                  flex: 1, border: "none", background: "transparent", padding: "14px 12px",
                  fontSize: 22, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: PAPER, outline: "none", fontFamily: "'Courier New', monospace",
                }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!regInput.trim() || searchStatus === "searching"}
              style={{
                background: SIGNAL, color: INK, border: "none", borderRadius: 10, padding: "0 22px",
                fontSize: 14, fontWeight: 800, cursor: "pointer",
                opacity: !regInput.trim() ? 0.5 : 1,
              }}
            >
              {searchStatus === "searching" ? "..." : "Find"}
            </button>
          </div>
        </div>

        {/* Step 2: vehicle/customer */}
        {searchStatus === "found" && vehicle && (
          <div style={panelStyle}>
            <span style={labelStyle}>Vehicle on file</span>
            <div style={{ fontSize: 16, fontWeight: 800, color: PAPER, marginBottom: 4 }}>
              {[vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(" · ") || "Vehicle"}
            </div>
            <div style={{ fontSize: 13, color: CHROME, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              {vehicle.customers ? (vehicle.customers.name + " · " + vehicle.customers.phone) : "Customer on file"}
              {vehicle.customers && <LoyaltyBadge customer={vehicle.customers} size="sm" />}
            </div>
            <VehiclePhotoUpload vehicleId={vehicle.id} />
          </div>
        )}

        {searchStatus === "not_found" && (
          <div style={panelStyle}>
            <span style={labelStyle}>New vehicle -- customer details</span>
            <input value={custName} onChange={function (e) { setCustName(e.target.value); }}
              placeholder="Customer name" style={Object.assign({}, inputStyle, { marginBottom: 10 })} />
            <input value={custPhone} onChange={function (e) { setCustPhone(e.target.value); }}
              placeholder="Phone number" style={Object.assign({}, inputStyle, { marginBottom: 16 })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={vMake} onChange={function (e) { setVMake(e.target.value); }}
                placeholder="Make" style={inputStyle} />
              <input value={vModel} onChange={function (e) { setVModel(e.target.value); }}
                placeholder="Model" style={inputStyle} />
            </div>
            <input value={vColor} onChange={function (e) { setVColor(e.target.value); }}
              placeholder="Color" style={Object.assign({}, inputStyle, { marginTop: 10 })} />
          </div>
        )}

        {searchStatus === "not_found" && (
          <div style={panelStyle}>
            <span style={labelStyle}>Referred by (optional)</span>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={referrerPhone}
                onChange={function (e) { setReferrerPhone(e.target.value); setReferrer(null); setReferrerSearchStatus("idle"); }}
                placeholder="Referrer's phone number" style={Object.assign({}, inputStyle, { flex: 1 })} />
              <button onClick={handleReferrerSearch} disabled={!referrerPhone.trim()} style={{
                padding: "0 18px", borderRadius: 10, border: "1.5px solid " + SIGNAL, background: "transparent",
                color: SIGNAL, fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>
                Find
              </button>
            </div>
            {referrerSearchStatus === "found" && referrer && (
              <div style={{ fontSize: 12, color: SIGNAL, marginTop: 8, fontWeight: 700 }}>
                ✓ {referrer.name} — both get {salon && salon.referral_reward_pct != null ? salon.referral_reward_pct : 10}% off
              </div>
            )}
            {referrerSearchStatus === "not_found" && (
              <div style={{ fontSize: 12, color: ALERT, marginTop: 8 }}>
                No customer found with that phone number.
              </div>
            )}
          </div>
        )}

        {/* Step 3: services */}
        {(searchStatus === "found" || searchStatus === "not_found") && (
          <div style={panelStyle}>
            <span style={labelStyle}>Services</span>
            {services.length === 0 && (
              <div style={{ fontSize: 13, color: CHROME }}>No services set up yet for this business.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {services.map(function (s) {
                var isOn = !!selected[s.id];
                return (
                  <div key={s.id} onClick={function () { toggleService(s.id); }} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                    border: "1.5px solid " + (isOn ? SIGNAL : "rgba(143,166,184,0.2)"),
                    background: isOn ? "rgba(61,220,151,0.1)" : "rgba(255,255,255,0.02)",
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{s.name}</div>
                      {s.duration_minutes && (
                        <div style={{ fontSize: 11, color: CHROME }}>{s.duration_minutes} min</div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: isOn ? SIGNAL : CHROME }}>
                      {money(s.price)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {result === "error" && (
          <div style={{
            background: "rgba(255,107,74,0.12)", border: "1px solid " + ALERT, borderRadius: 10,
            padding: "12px 14px", color: ALERT, fontSize: 13, marginBottom: 16,
          }}>
            Couldn't complete check-in. Please try again.
          </div>
        )}
      </div>

      {/* Sticky bottom action bar */}
      {(searchStatus === "found" || searchStatus === "not_found") && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, background: STEEL,
          borderTop: "1px solid rgba(143,166,184,0.2)", padding: 16,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 10, color: CHROME, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: PAPER }}>{money(total)}</div>
          </div>
          <button
            onClick={handleCheckIn}
            disabled={!canSubmit}
            style={{
              flex: 1, maxWidth: 260, background: canSubmit ? SIGNAL : "rgba(143,166,184,0.2)",
              color: canSubmit ? INK : CHROME, border: "none", borderRadius: 12, padding: "16px 0",
              fontSize: 15, fontWeight: 800, cursor: canSubmit ? "pointer" : "default",
            }}
          >
            {submitting ? "Checking in..." : "Check In →"}
          </button>
        </div>
      )}
    </div>
  );
}
