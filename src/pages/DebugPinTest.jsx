// src/pages/DebugPinTest.jsx
//
// TEMPORARY - delete once device-pin-login is confirmed working and
// wired into the real login screen. Exists purely so this can be tested
// by clicking a button and reading the result on-screen, rather than
// fighting with the browser console.

import { useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/constants.js";

export default function DebugPinTest() {
  var [salonId, setSalonId] = useState("5c29e939-c127-4e3c-ab7b-3e11138016a8");
  var [role,    setRole]    = useState("admin");
  var [pin,     setPin]     = useState("0987");
  var [result,  setResult]  = useState(null);
  var [loading, setLoading] = useState(false);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      var res = await fetch(SUPABASE_URL + "/functions/v1/device-pin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
        },
        body: JSON.stringify({ salon_id: salonId, role: role, pin: pin }),
      });
      var data = await res.json().catch(function() { return { parseError: true }; });
      setResult({ httpStatus: res.status, body: data });
    } catch (e) {
      setResult({ networkError: String(e) });
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1A1A1A", color: "#fff", padding: 24, fontFamily: "monospace" }}>
      <h2 style={{ color: "#C9A84C" }}>device-pin-login test page</h2>
      <p style={{ color: "#999", fontSize: 13 }}>Temporary debug page - not linked from anywhere in the app.</p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#999" }}>salon_id</label>
        <input value={salonId} onChange={function(e) { setSalonId(e.target.value); }}
          style={{ width: "100%", padding: 8, fontFamily: "monospace", background: "#000", color: "#fff", border: "1px solid #444" }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#999" }}>role</label>
        <select value={role} onChange={function(e) { setRole(e.target.value); }}
          style={{ width: "100%", padding: 8, fontFamily: "monospace", background: "#000", color: "#fff", border: "1px solid #444" }}>
          <option value="admin">admin</option>
          <option value="staff">staff</option>
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#999" }}>pin</label>
        <input value={pin} onChange={function(e) { setPin(e.target.value); }}
          style={{ width: "100%", padding: 8, fontFamily: "monospace", background: "#000", color: "#fff", border: "1px solid #444" }} />
      </div>

      <button onClick={runTest} disabled={loading}
        style={{ background: "#C9A84C", color: "#000", border: "none", padding: "12px 24px", fontWeight: "bold", cursor: "pointer", fontSize: 15 }}>
        {loading ? "Sending..." : "Run Test"}
      </button>

      {result && (
        <div style={{ marginTop: 24, background: "#000", border: "1px solid #444", padding: 16, borderRadius: 6 }}>
          <div style={{ color: "#999", marginBottom: 8 }}>Result:</div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: result.body && result.body.success ? "#4ADE80" : "#F87171", fontSize: 13 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
