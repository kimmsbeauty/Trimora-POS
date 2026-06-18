// src/components/LoyaltyBadge.jsx

import { getLoyaltyTier } from "../lib/loyalty.js";

export default function LoyaltyBadge({ customer, size }) {
  size = size || "sm";
  var info = getLoyaltyTier(customer);

  if (info.tier === "New") return null;

  var sizes = {
    sm: { padding: "2px 7px", fontSize: 9 },
    md: { padding: "3px 9px", fontSize: 10 },
    lg: { padding: "4px 12px", fontSize: 11 },
  };
  var s = sizes[size] || sizes.sm;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: s.padding, borderRadius: 20,
      background: info.bg, color: info.color,
      fontSize: s.fontSize, fontWeight: 800,
      border: "1px solid " + info.border,
      whiteSpace: "nowrap",
    }}>
      <span>{info.icon}</span>{info.tier}
    </span>
  );
}
