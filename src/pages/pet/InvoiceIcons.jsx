// src/pages/pet/InvoiceIcons.jsx -- small inline icons for the printed invoice.
import React from "react";

var PATHS = {
  pin: <g><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></g>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: <g><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></g>,
  globe: <g><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></g>,
  calendar: <g><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></g>,
  user: <g><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></g>,
  paw: (
    <g>
      <circle cx="5" cy="11" r="2" /><circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="6" r="2" /><circle cx="19" cy="11" r="2" />
      <path d="M12 12c-3 0-6 3-6 6 0 2 2 3 4 2 1-.5 1.5-.5 2-.5s1 0 2 .5c2 1 4 0 4-2 0-3-3-6-6-6z" />
    </g>
  ),
};
var FILLED = { user: true, paw: true };

export default function InvoiceIcon({ name, size, color }) {
  var filled = !!FILLED[name];
  return (
    <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={filled ? color : "none"} stroke={color} strokeWidth={filled ? 1 : 1.8} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: "none" }}>
      {PATHS[name]}
    </svg>
  );
}
