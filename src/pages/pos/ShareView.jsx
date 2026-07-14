// src/pages/pos/ShareView.jsx
//
// Extracted from POSApp.jsx (was the `page === "share"` inline block).
// Mechanical extraction only — no logic changes.

import ShareBookingPanel from "../../components/ShareBookingPanel.jsx";

export default function ShareView({ salon }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <ShareBookingPanel salon={salon} />
    </div>
  );
}
