import { useState } from "react";
import { GOLD, GOLD_DIM, BLACK, WHITE, DARK, CREAM, GREEN, RED } from "../../lib/constants";
import { PET_NAME } from "../pet/theme";

// Trimora Pet tab of the super-admin console, modelled on CarWashesView.
//
// A "pet business" is a tenant whose business_type is 'pet' (set by the shared
// onboard/invite flow with module key 'pet'). An existing business of another
// type can also be given Trimora Pet via superadmin_set_module, exactly like
// Auto.
//
// Deliberately NOT done here: showing whether Pet is on for an existing
// business. salon_directory has no pet column and I will not redefine that view
// from repo SQL (migration 048 in the repo omits business_type, which the live
// view clearly has, so the repo copy does not match production). Until the
// directory view is verified against the live schema, the existing-business
// section offers explicit Turn on / Turn off actions without a status badge.
export default function PetBusinessesView({
  salons, view, setView, PRODUCTS, Badge,
  setManualModuleKey, setManualModal, setManualDone,
  setInviteModuleKey, setInviteModal, setInviteLink, setInviteEmail, setInviteName,
  openSalonDetail, actionLoading, togglePetModule,
}) {
  var selectedState = useState("");
  var selectedId = selectedState[0]; var setSelectedId = selectedState[1];

  var petBusinesses = salons.filter(function (s) { return s.business_type === "pet"; });
  var others = salons.filter(function (s) { return s.business_type !== "pet"; });
  var selected = others.filter(function (s) { return s.id === selectedId; })[0];

  function turnOff(s) {
    if (window.confirm("Turn off " + PET_NAME + " for " + s.name + "? Their staff will see a \"not turned on\" screen until it is enabled again.")) {
      togglePetModule(s, false);
    }
  }

  var pill = {
    flexShrink: 0, background: "rgba(255,255,255,0.1)", border: "1px solid " + GOLD_DIM + "44",
    color: WHITE, borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
  };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, padding: "0 0 80px" }}>
      <div style={{ background: BLACK, padding: "16px 20px" }}>
        <button onClick={function () { setView("salons"); }}
          style={{ background: "none", border: "none", color: GOLD_DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8, padding: 0 }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>🐾 Pet Businesses ({PET_NAME})</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "aa", marginTop: 2, marginBottom: 10 }}>
          {petBusinesses.length} pet business{petBusinesses.length === 1 ? "" : "es"} · use + Onboard or + Invite below to add a new one
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PRODUCTS.map(function (p) {
            var active = p.views.indexOf(view) !== -1;
            return (
              <button key={p.key} onClick={function () { setView(p.homeView); }} style={{
                flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                background: active ? GOLD : "rgba(255,255,255,0.08)",
                color: active ? BLACK : GOLD_DIM, fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}>
                {p.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button style={pill} onClick={function () { setManualModuleKey("pet"); setManualModal(true); setManualDone(""); }}>+ Onboard</button>
          <button style={pill} onClick={function () { setInviteModuleKey("pet"); setInviteModal(true); setInviteLink(""); setInviteEmail(""); setInviteName(""); }}>+ Invite</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {petBusinesses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#999" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🐾</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 6 }}>No pet businesses onboarded yet</div>
            <div style={{ fontSize: 12 }}>Use <b>+ Onboard</b> or <b>+ Invite</b> above to create one from scratch.</div>
          </div>
        ) : (
          petBusinesses.map(function (s) {
            return (
              <div key={s.id} onClick={function () { openSalonDetail(s, "petbusinesses"); }}
                style={{ background: WHITE, borderRadius: 14, padding: 14, marginBottom: 10, border: "1.5px solid " + GOLD_DIM + "33", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{s.name}</div>
                      <Badge color={GREEN}>Onboarded</Badge>
                      {s.suspended && <Badge color={RED}>Account suspended</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      /{s.slug}/pet{s.created_at ? " · created " + new Date(s.created_at).toLocaleDateString() : ""}
                    </div>
                  </div>
                  <button disabled={actionLoading}
                    onClick={function (e) { e.stopPropagation(); turnOff(s); }}
                    style={{ background: "#FEE2E2", color: RED, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: actionLoading ? "default" : "pointer", opacity: actionLoading ? 0.6 : 1, flexShrink: 0 }}>
                    Turn off
                  </button>
                </div>
              </div>
            );
          })
        )}

        {others.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid " + GOLD_DIM + "33" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              Add {PET_NAME} to an existing business instead
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={selectedId} onChange={function (e) { setSelectedId(e.target.value); }} aria-label="Existing business"
                style={{ flex: "1 1 180px", padding: "10px 12px", borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "44", fontSize: 13, background: WHITE }}>
                <option value="">Select a business…</option>
                {others.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
              </select>
              <button disabled={actionLoading || !selected}
                onClick={function () { if (selected) { togglePetModule(selected, true); setSelectedId(""); } }}
                style={{ background: selected ? GOLD_DIM : "#E5E0D5", color: selected ? BLACK : "#999", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 800, cursor: selected && !actionLoading ? "pointer" : "default" }}>
                Turn on
              </button>
              <button disabled={actionLoading || !selected}
                onClick={function () { if (selected) { turnOff(selected); setSelectedId(""); } }}
                style={{ background: "#FEE2E2", color: selected ? RED : "#bbb", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 800, cursor: selected && !actionLoading ? "pointer" : "default" }}>
                Turn off
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 8, lineHeight: 1.5 }}>
              Whether {PET_NAME} is currently on for a business isn't shown here yet. The change is recorded in the audit log.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
