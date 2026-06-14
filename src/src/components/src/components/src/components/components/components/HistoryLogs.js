import React from "react";

const WHITE = "#FFFFFF";
const DARK = "#1A1400";
const RED = "#EF4444";

export default function HistoryLogs({ sales, onDeleteSale, role }) {
  function fmt(n) { return "KES " + Number(n).toLocaleString(); }

  return (
    <div style={{ background: WHITE, borderRadius: 16, border: "1px solid #EAE5D9", padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: DARK }}>Sales Journal Audit Trail</h3>
        <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>Total Entries: {sales.length}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #F5F0E8", color: "#8A6F2E", fontWeight: 800 }}>
              <th style={{ padding: 10 }}>Timestamp</th>
              <th style={{ padding: 10 }}>Client</th>
              <th style={{ padding: 10 }}>Stylist</th>
              <th style={{ padding: 10 }}>Services Rendered</th>
              <th style={{ padding: 10 }}>Mode</th>
              <th style={{ padding: 10 }}>Settled</th>
              {role === "admin" && <th style={{ padding: 10, textAlign: "center" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr><td colSpan={role === "admin" ? 7 : 6} style={{ padding: 24, textAlign: "center", color: "#aaa" }}>No historic transactions logged yet.</td></tr>
            ) : (
              sales.map((s, index) => {
                const itemsList = Array.isArray(s.items) ? s.items : [];
                return (
                  <tr key={s.id || index} style={{ borderBottom: "1px solid #F5F0E8", color: DARK }}>
                    <td style={{ padding: 10, whiteSpace: "nowrap" }}><div>{s.date}</div><div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{s.time}</div></td>
                    <td style={{ padding: 10 }}><div>{s.client || "Walk-in"}</div><div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{s.phone || "N/A"}</div></td>
                    <td style={{ padding: 10, fontWeight: 600 }}>{s.stylist}</td>
                    <td style={{ padding: 10, maxWidth: 220 }}>
                      {itemsList.map((it, i) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 2 }}>• {it?.name} <span style={{ color: "#888" }}>({fmt(it?.price)})</span></div>
                      ))}
                    </td>
                    <td style={{ padding: 10 }}><span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.payment === "M-Pesa" ? "#E0F2FE" : "#FEF3C7", color: s.payment === "M-Pesa" ? "#0369A1" : "#B45309" }}>{s.payment}</span></td>
                    <td style={{ padding: 10, fontWeight: 900, color: "#8A6F2E" }}>{fmt(s.total)}</td>
                    {role === "admin" && (
                      <td style={{ padding: 10, textAlign: "center" }}>
                        <button onClick={() => { if(window.confirm("Delete this receipt entry permanently?")) onDeleteSale(s.id); }} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑 Delete</button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
