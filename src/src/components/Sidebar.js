import React from "react";

// Brand constants passed or imported from config if needed. Here matching main file styles.
const BLACK = "#0A0A0A";
const GOLD = "#C9A84C";
const GOLD_LT = "#F0CC6E";
const GOLD_DIM = "#8A6F2E";
const WHITE = "#FFFFFF";

function KimmsLogo({ size = "md", dark = false }) {
  const s = { 
    sm: { crown: 18, name: 15, tag: 9, sub: 8 }, 
    md: { crown: 26, name: 22, tag: 12, sub: 10 }, 
    lg: { crown: 38, name: 32, tag: 16, sub: 12 } 
  }[size] || { crown: 26, name: 22, tag: 12, sub: 10 };
  const goldColor = dark ? GOLD_DIM : GOLD_LT;
  const textColor = dark ? "#1A1400" : WHITE;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}>
      <svg width={s.crown * 2} height={s.crown} viewBox="0 0 60 30" fill="none" style={{ marginBottom: 2 }}>
        <polygon points="5,28 15,8 30,20 45,8 55,28" fill="none" stroke={goldColor} strokeWidth="3" strokeLinejoin="round" />
        <circle cx="5" cy="28" r="3" fill={goldColor} />
        <circle cx="30" cy="20" r="3" fill={goldColor} />
        <circle cx="55" cy="28" r="3" fill={goldColor} />
        <line x1="5" y1="28" x2="55" y2="28" stroke={goldColor} strokeWidth="3" />
      </svg>
      <div style={{ fontFamily: "Georgia,serif", fontSize: s.name, fontWeight: 900, color: goldColor, letterSpacing: "0.04em", fontStyle: "italic" }}>Kimm's</div>
      <div style={{ fontSize: s.tag, fontWeight: 800, color: textColor, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 1 }}>Beauty Parlour</div>
      <div style={{ fontSize: s.sub, color: goldColor, letterSpacing: "0.1em", fontStyle: "italic", marginTop: 1, opacity: 0.85 }}>Beauty That Speaks Confidence</div>
    </div>
  );
}

export default function Sidebar({ view, setView, role, onLogout, onOpenFeedback }) {
  const menuItems = [
    { id: "pos", name: "✂ POS Desk", roles: ["staff", "admin"] },
    { id: "bookings", name: "📅 Bookings Desk", roles: ["staff", "admin"] },
    { id: "history", name: "📜 History Logs", roles: ["staff", "admin"] },
    { id: "analytics", name: "👑 Analytics Panel", roles: ["admin"] },
    { id: "services", name: "⚙ Service Settings", roles: ["admin"] },
    { id: "staff", name: "👥 Staff Settings", roles: ["admin"] },
    { id: "customers", name: "💝 Client Loyalty", roles: ["admin"] },
    { id: "feedback", name: "⭐ Review Metrics", roles: ["admin"] },
  ];

  return (
    <div style={{ width: 260, background: BLACK, borderRight: `2px solid ${GOLD_DIM}`, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100vh", boxSizing: "border-box", position: "fixed", top: 0, left: 0 }}>
      <div>
        <div style={{ padding: "10px 0 24px" }}>
          <KimmsLogo size="md" dark={false} />
        </div>
        <div style={{ display: "inline-block", width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 12px", border: `1px solid ${GOLD_DIM}`, boxSizing: "border-box", textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: GOLD_LT, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Authorized User</div>
          <div style={{ fontSize: 13, color: WHITE, fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {role === "admin" ? "👑 Administrator" : "✂ Salon Staff"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {menuItems.filter(item => item.roles.includes(role)).map(item => (
            <button key={item.id} onClick={() => setView(item.id)} style={{ width: "100%", border: "none", borderRadius: 10, padding: "13px 16px", textAlign: "left", fontSize: 13, fontWeight: 700, background: view === item.id ? `linear-gradient(135deg,${GOLD},${GOLD_LT})` : "transparent", color: view === item.id ? BLACK : "rgba(255,255,255,0.65)", cursor: "pointer", transition: "all 0.2s" }}>
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={onOpenFeedback} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${GOLD_DIM}`, borderRadius: 10, padding: "11px", color: GOLD_LT, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>⭐ Walk-in Feedback Form</button>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>🚪 Logout Session</button>
      </div>
    </div>
  );
}
export { KimmsLogo };
