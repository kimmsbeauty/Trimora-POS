// src/pages/pet/ui.jsx
// Small shared building blocks for Trimora Pet screens. Colours come only from
// ./theme (no hex literals here).
import React, { useEffect } from "react";
import {
  CARD, BORDER, MUTED, MUTED_FG, FOREGROUND, PRIMARY, PRIMARY_FG, DESTRUCTIVE, SUCCESS, WARNING, INFO,
  ACCENT, ACCENT_FG, VIOLET, FONT_BODY, FONT_HEADING,
} from "./theme";

export var inputStyle = {
  width: "100%", boxSizing: "border-box", border: "1px solid " + BORDER, background: CARD, color: FOREGROUND,
  borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: FONT_BODY, outline: "none",
};

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <div>
        <h1 style={{ fontFamily: FONT_HEADING, fontSize: 26, fontWeight: 600, margin: 0 }}>{title}</h1>
        {subtitle ? <p style={{ margin: "4px 0 0", color: MUTED_FG, fontSize: 13 }}>{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, style }) {
  return <div style={Object.assign({ background: CARD, border: "1px solid " + BORDER, borderRadius: 16 }, style || {})}>{children}</div>;
}

// brand = optional {primary, onPrimary}: the public booking page passes the business's own colours.
export function Button({ children, onClick, variant, disabled, type, size, ariaLabel, brand }) {
  var bg = brand ? brand.primary : PRIMARY; var fg = brand ? brand.onPrimary : PRIMARY_FG; var border = "none";
  if (variant === "ghost") { bg = "transparent"; fg = FOREGROUND; }
  if (variant === "outline") { bg = CARD; fg = FOREGROUND; border = "1px solid " + BORDER; }
  if (variant === "danger") { bg = DESTRUCTIVE; fg = CARD; }
  if (variant === "ghost-danger") { bg = "transparent"; fg = DESTRUCTIVE; }
  var small = size === "sm";
  return (
    <button type={type || "button"} onClick={onClick} disabled={disabled} aria-label={ariaLabel} style={{
      background: bg, color: fg, border: border, borderRadius: 10, fontWeight: 700, fontFamily: FONT_BODY,
      fontSize: small ? 12 : 13, padding: small ? "6px 10px" : "9px 16px", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

export function Field({ label, children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED_FG }}>
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

var TONES = {
  success: { bg: ACCENT, fg: SUCCESS }, warning: { bg: ACCENT, fg: WARNING },
  danger: { bg: ACCENT, fg: DESTRUCTIVE }, info: { bg: ACCENT, fg: INFO }, neutral: { bg: MUTED, fg: MUTED_FG },
  // prototype status colours: Checked In (gold), Ready for Collection (violet)
  gold: { bg: ACCENT, fg: ACCENT_FG }, violet: { bg: ACCENT, fg: VIOLET },
};
export function Badge({ tone, children }) {
  var t = TONES[tone] || TONES.neutral;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: t.bg, color: t.fg, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: t.fg }} />
      {children}
    </span>
  );
}

export function ErrorLine({ children }) {
  if (!children) return null;
  return <p role="alert" style={{ margin: "8px 0 0", color: DESTRUCTIVE, fontSize: 12, fontWeight: 700 }}>{children}</p>;
}

export function Modal({ open, onClose, title, description, children, footer, width }) {
  useEffect(function () {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(27,30,36,0.6)" }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{
        position: "relative", background: CARD, borderRadius: 16, border: "1px solid " + BORDER, width: "100%",
        maxWidth: width || 520, maxHeight: "90vh", overflowY: "auto", padding: 20, fontFamily: FONT_BODY, color: FOREGROUND,
      }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h2>
        {description ? <p style={{ margin: "4px 0 12px", color: MUTED_FG, fontSize: 12 }}>{description}</p> : <div style={{ height: 12 }} />}
        {children}
        {footer ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 16px" }}>
      <div style={{ fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 600 }}>{title}</div>
      {description ? <p style={{ margin: "6px auto 0", maxWidth: 360, color: MUTED_FG, fontSize: 13, lineHeight: 1.5 }}>{description}</p> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}
