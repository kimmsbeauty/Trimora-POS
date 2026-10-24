// src/pages/pet/PetShell.jsx
//
// Trimora Pet app shell: fixed 256px sidebar on desktop, sticky 56px top bar
// with a 288px slide-in drawer below 1024px. Layout, sizes and nav-item states
// follow PET_MODULE_SPEC section 4. All colours come from ./theme.
import React, { useState } from "react";
import PetIcon from "./PetIcon";
import { petInitials } from "./petNav";
import {
  PET_NAME, PET_BRAND_CAPTION, BACKGROUND, FOREGROUND, CARD, BORDER, PRIMARY, PRIMARY_FG,
  SIDEBAR, SIDEBAR_FG, SIDEBAR_MUTED, FONT_BODY, FONT_HEADING,
} from "./theme";

// Geometry below mirrors the approved prototype's app-shell (Tailwind sizes
// converted to px): sidebar w-64, drawer w-72, top bar h-14, nav gap/space-y-1,
// active bar w-1 x h-5 centred, content max-w-[1200px].
var CSS = [
  ".pet-shell { min-height: 100vh; background: " + BACKGROUND + "; color: " + FOREGROUND + "; font-family: " + FONT_BODY + "; -webkit-font-smoothing: antialiased; }",
  ".pet-shell h1, .pet-shell h2, .pet-shell h3 { letter-spacing: -0.015em; }",
  ".pet-side { position: fixed; top: 0; left: 0; bottom: 0; width: 256px; background: " + SIDEBAR + "; color: " + SIDEBAR_FG + "; display: none; flex-direction: column; z-index: 30; }",
  ".pet-main { min-height: 100vh; }",
  ".pet-topbar { position: sticky; top: 0; z-index: 40; height: 56px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: rgba(255,255,255,0.95); border-bottom: 1px solid " + BORDER + "; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); color: " + FOREGROUND + "; }",
  ".pet-menubtn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid " + BORDER + "; border-radius: 8px; background: " + CARD + "; color: " + FOREGROUND + "; cursor: pointer; padding: 0; }",
  ".pet-content { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }",
  ".pet-nav { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }",
  ".pet-nav-item { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: " + SIDEBAR_MUTED + "; font: 500 13px " + FONT_BODY + "; text-align: left; cursor: pointer; transition: background-color .15s, color .15s; }",
  ".pet-nav-item:hover { background: rgba(255,255,255,0.042); color: " + SIDEBAR_FG + "; }",
  ".pet-nav-item.active { background: rgba(255,255,255,0.07); color: " + SIDEBAR_FG + "; }",
  ".pet-nav-item.active::before { content: ''; position: absolute; left: 0; top: 50%; width: 4px; height: 20px; transform: translateY(-50%); border-radius: 0 999px 999px 0; background: " + PRIMARY + "; }",
  ".pet-nav-item.active .pet-nav-icon { color: " + PRIMARY + "; }",
  ".pet-nav-item:focus-visible, .pet-iconbtn:focus-visible, .pet-menubtn:focus-visible { outline: 2px solid " + PRIMARY + "; outline-offset: 2px; }",
  ".pet-iconbtn { background: transparent; border: 0; color: inherit; cursor: pointer; padding: 8px; border-radius: 8px; display: inline-flex; }",
  ".pet-drawer-backdrop { position: fixed; inset: 0; background: rgba(27,30,36,0.6); z-index: 50; }",
  ".pet-drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 288px; max-width: 85vw; background: " + SIDEBAR + "; color: " + SIDEBAR_FG + "; z-index: 60; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }",
  ".pet-drawer-close { position: absolute; right: -44px; top: 16px; width: 40px; height: 40px; border-radius: 50%; border: 0; background: " + CARD + "; color: " + FOREGROUND + "; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }",
  "@media (min-width: 640px) { .pet-content { padding: 24px 24px; } }",
  "@media (min-width: 1024px) { .pet-side { display: flex; } .pet-main { margin-left: 256px; } .pet-topbar { display: none; } .pet-content { padding: 32px; } .pet-drawer, .pet-drawer-backdrop { display: none; } }",
  "@media print { body { background: white; } .pet-side, .pet-topbar, .pet-drawer, .pet-drawer-backdrop, .no-print { display: none !important; } .pet-main { margin-left: 0 !important; } .pet-content { max-width: none; padding: 0; } }",
].join("\n");

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 20px 20px" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: PRIMARY, color: PRIMARY_FG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.2)" }}>
        <PetIcon name="paw" size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 600, lineHeight: 1.25, color: SIDEBAR_FG }}>{PET_NAME}</div>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: SIDEBAR_MUTED }}>{PET_BRAND_CAPTION}</div>
      </div>
    </div>
  );
}

function SideContents({ nav, active, onSelect, businessName, roleLabel, onLogout }) {
  return (
    <>
      <Brand />
      <nav aria-label="Main navigation" className="pet-nav">
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
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 8, background: "rgba(255,255,255,0.042)", padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(225,172,65,0.25)", color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEADING, fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
            {petInitials(businessName)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: SIDEBAR_FG, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{businessName || PET_NAME}</div>
            <div style={{ fontSize: 11, color: SIDEBAR_MUTED }}>{roleLabel}</div>
          </div>
          <button type="button" className="pet-iconbtn" onClick={onLogout} aria-label="Log out" title="Log out" style={{ color: SIDEBAR_MUTED, padding: 6 }}>
            <PetIcon name="logout" size={16} />
          </button>
        </div>
        <p style={{ margin: "0 4px", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: PRIMARY, opacity: 0.9 }}>
          Signed in on this device
        </p>
      </div>
    </>
  );
}

export default function PetShell({ nav, active, onSelect, businessName, roleLabel, onLogout, children }) {
  var drawerState = useState(false);
  var drawerOpen = drawerState[0]; var setDrawerOpen = drawerState[1];

  function select(key) { setDrawerOpen(false); onSelect(key); }
  var shared = { nav: nav, active: active, onSelect: select, businessName: businessName, roleLabel: roleLabel, onLogout: onLogout };

  return (
    <div className="pet-shell">
      <style>{CSS}</style>
      <aside className="pet-side"><SideContents {...shared} /></aside>
      <header className="pet-topbar">
        <button type="button" className="pet-menubtn" aria-label="Open menu" onClick={function () { setDrawerOpen(true); }}>
          <PetIcon name="menu" size={20} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: PRIMARY, color: PRIMARY_FG, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PetIcon name="paw" size={16} />
          </div>
          <span style={{ fontFamily: FONT_HEADING, fontSize: 14, fontWeight: 600 }}>{PET_NAME}</span>
        </div>
      </header>
      {drawerOpen && (
        <>
          <div className="pet-drawer-backdrop" onClick={function () { setDrawerOpen(false); }} />
          <aside className="pet-drawer" role="dialog" aria-label="Navigation menu">
            <button type="button" className="pet-drawer-close" aria-label="Close menu" onClick={function () { setDrawerOpen(false); }}>
              <PetIcon name="close" size={20} />
            </button>
            <SideContents {...shared} />
          </aside>
        </>
      )}
      <main className="pet-main"><div className="pet-content">{children}</div></main>
    </div>
  );
}
