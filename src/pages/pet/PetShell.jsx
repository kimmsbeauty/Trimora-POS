// src/pages/pet/PetShell.jsx
//
// Trimora Pet app shell: fixed 256px sidebar on desktop, sticky 56px top bar
// with a 288px slide-in drawer below 1024px. Layout, sizes and nav-item states
// follow PET_MODULE_SPEC section 4. All colours come from ./theme.
import React, { useState } from "react";
import PetIcon from "./PetIcon";
import { petInitials } from "./petNav";
import {
  PET_NAME, PET_BRAND_CAPTION, BACKGROUND, FOREGROUND, PRIMARY, PRIMARY_FG,
  SIDEBAR, SIDEBAR_FG, SIDEBAR_MUTED, SUCCESS, FONT_BODY, FONT_HEADING,
} from "./theme";

var CSS = [
  ".pet-shell { min-height: 100vh; background: " + BACKGROUND + "; color: " + FOREGROUND + "; font-family: " + FONT_BODY + "; }",
  ".pet-side { position: fixed; top: 0; left: 0; bottom: 0; width: 256px; background: " + SIDEBAR + "; color: " + SIDEBAR_FG + "; display: none; flex-direction: column; z-index: 40; }",
  ".pet-main { min-height: 100vh; }",
  ".pet-topbar { position: sticky; top: 0; z-index: 30; height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 12px; background: " + SIDEBAR + "; color: " + SIDEBAR_FG + "; }",
  ".pet-content { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }",
  ".pet-nav-item { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: " + SIDEBAR_MUTED + "; font: 500 13px " + FONT_BODY + "; text-align: left; cursor: pointer; }",
  ".pet-nav-item:hover { background: rgba(255,255,255,0.042); color: " + SIDEBAR_FG + "; }",
  ".pet-nav-item.active { background: rgba(255,255,255,0.07); color: " + SIDEBAR_FG + "; }",
  ".pet-nav-item.active::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 4px; border-radius: 0 4px 4px 0; background: " + PRIMARY + "; }",
  ".pet-nav-item.active .pet-nav-icon { color: " + PRIMARY + "; }",
  ".pet-nav-item:focus-visible, .pet-iconbtn:focus-visible { outline: 2px solid " + PRIMARY + "; outline-offset: 2px; }",
  ".pet-iconbtn { background: transparent; border: 0; color: inherit; cursor: pointer; padding: 8px; border-radius: 8px; display: inline-flex; }",
  ".pet-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50; }",
  ".pet-drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 288px; max-width: 86vw; background: " + SIDEBAR + "; color: " + SIDEBAR_FG + "; z-index: 60; display: flex; flex-direction: column; }",
  "@media (min-width: 640px) { .pet-content { padding: 24px 24px; } }",
  "@media (min-width: 1024px) { .pet-side { display: flex; } .pet-main { margin-left: 256px; } .pet-topbar { display: none; } .pet-content { padding: 32px; } .pet-drawer, .pet-drawer-backdrop { display: none; } }",
  "@media print { .pet-side, .pet-topbar, .pet-drawer, .pet-drawer-backdrop, .no-print { display: none !important; } .pet-main { margin-left: 0 !important; } .pet-content { max-width: none; padding: 0; } }",
].join("\n");

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 16px 16px" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: PRIMARY, color: PRIMARY_FG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <PetIcon name="paw" size={22} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{PET_NAME}</div>
        <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: SIDEBAR_MUTED, marginTop: 3 }}>{PET_BRAND_CAPTION}</div>
      </div>
    </div>
  );
}

function SideContents({ nav, active, onSelect, businessName, roleLabel, onLogout }) {
  return (
    <>
      <Brand />
      <nav aria-label="Trimora Pet" style={{ flex: 1, overflowY: "auto", padding: "4px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {nav.map(function (item) {
          var isActive = item.key === active;
          return (
            <button key={item.key} type="button" className={"pet-nav-item" + (isActive ? " active" : "")}
              aria-current={isActive ? "page" : undefined} onClick={function () { onSelect(item.key); }}>
              <span className="pet-nav-icon" style={{ display: "inline-flex" }}><PetIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(225,172,65,0.18)", color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {petInitials(businessName)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{businessName || PET_NAME}</div>
            <div style={{ fontSize: 11, color: SIDEBAR_MUTED }}>{roleLabel}</div>
          </div>
          <button type="button" className="pet-iconbtn" onClick={onLogout} aria-label="Log out" title="Log out" style={{ color: SIDEBAR_MUTED }}>
            <PetIcon name="logout" size={16} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 11, color: PRIMARY }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: SUCCESS }} />
          <span>Signed in on this device</span>
        </div>
      </div>
    </>
  );
}

export default function PetShell({ nav, active, onSelect, businessName, roleLabel, onLogout, children }) {
  var drawerState = useState(false);
  var drawerOpen = drawerState[0]; var setDrawerOpen = drawerState[1];

  function select(key) { setDrawerOpen(false); onSelect(key); }
  var shared = { nav: nav, active: active, onSelect: select, businessName: businessName, roleLabel: roleLabel, onLogout: onLogout };
  var current = nav.filter(function (n) { return n.key === active; })[0];

  return (
    <div className="pet-shell">
      <style>{CSS}</style>
      <aside className="pet-side"><SideContents {...shared} /></aside>
      <header className="pet-topbar">
        <button type="button" className="pet-iconbtn" aria-label="Open menu" onClick={function () { setDrawerOpen(true); }}>
          <PetIcon name="menu" size={22} />
        </button>
        <div style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 600 }}>{PET_NAME}</div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: SIDEBAR_MUTED }}>{current ? current.label : ""}</div>
      </header>
      {drawerOpen && (
        <>
          <div className="pet-drawer-backdrop" onClick={function () { setDrawerOpen(false); }} />
          <aside className="pet-drawer" role="dialog" aria-label="Menu">
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 8px 0" }}>
              <button type="button" className="pet-iconbtn" aria-label="Close menu" onClick={function () { setDrawerOpen(false); }} style={{ color: SIDEBAR_MUTED }}>
                <PetIcon name="close" size={20} />
              </button>
            </div>
            <SideContents {...shared} />
          </aside>
        </>
      )}
      <main className="pet-main"><div className="pet-content">{children}</div></main>
    </div>
  );
}
