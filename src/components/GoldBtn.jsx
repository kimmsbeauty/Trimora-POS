// src/components/GoldBtn.jsx

import { GOLD, GOLD_LT, BLACK } from "../lib/constants";

export default function GoldBtn({ children, onClick, style = {}, disabled = false, outline = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: outline ? "transparent" : `linear-gradient(135deg,${GOLD} 0%,${GOLD_LT} 50%,${GOLD} 100%)`,
        color: outline ? GOLD : BLACK,
        border: `2px solid ${GOLD}`,
        borderRadius: 10,
        padding: "12px 0",
        fontWeight: 900,
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        letterSpacing: "0.04em",
        boxShadow: outline ? "none" : `0 2px 12px rgba(201,168,76,0.35)`,
        transition: "all 0.2s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}