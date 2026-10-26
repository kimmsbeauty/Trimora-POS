// src/pages/pet/PetIcon.jsx
// Small inline-SVG icon set (no icon library, per spec). 24x24, stroke-based.
import React from "react";

var PATHS = {
  paw: (
    <g>
      <circle cx="5" cy="11" r="2" /><circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="6" r="2" /><circle cx="19" cy="11" r="2" />
      <path d="M12 12c-3 0-6 3-6 6 0 2 2 3 4 2 1-.5 1.5-.5 2-.5s1 0 2 .5c2 1 4 0 4-2 0-3-3-6-6-6z" />
    </g>
  ),
  overview: <g><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></g>,
  checkout: <g><path d="M3 4h2l2 11h11l2-8H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></g>,
  calendar: <g><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></g>,
  customers: <g><circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2.5.7 4 2.6 4 6" /></g>,
  pets: <path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11z" />,
  grooming: <g><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 8l11 11M8.5 16l11-11" /></g>,
  boarding: <g><path d="M3 11l9-7 9 7v9H3z" /><path d="M9 20v-6h6v6" /></g>,
  invoices: <g><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 12h6M10 16h6" /></g>,
  supplies: <g><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></g>,
  requests: <g><path d="M4 13l2.5-7h11L20 13v6H4z" /><path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20" /></g>,
  reminders: <g><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></g>,
  loyalty: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  staff: <g><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></g>,
  reports: <g><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></g>,
  settings: <g><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></g>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  logout: <g><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" /></g>,
};

export default function PetIcon({ name, size, color }) {
  var s = size || 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name] || PATHS.paw}
    </svg>
  );
}
