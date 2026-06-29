// src/pages/DebugBackfillSecrets.jsx
//
// TEMPORARY - delete once every existing salon has been backfilled.
// Lists every salon with a button to run admin-set-device-secret for it,
// result shown directly on screen. No console needed.

import { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/constants.js";
import { db } from "../lib/db.js";

export default function DebugBackfillSecrets() {
  var [salons, setSalons]   = useState([]);
  var [loading, setLoading] = useState(true);
  var [results, setResults] = useState({});
  var [running, setRunning] = useState({});

  useEffect(function() {
    db("GET", "public_salon_directory", null, "?select=id,name&order=name.asc").then(function(rows) {
      setSalons(rows || []);
      setLoading(false);
    });
  }, []);

  async function runFor(salonId) {
    setRunning(function(p) { return Object.assign({}, p, { [salonId]: true }); });
    try {
      var res = await fetch(SUPABASE_URL + "/functions/v1/admin-set-device-secret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
        },
        body: JSON.stringify({ salon_id: salonId }),
      });
      var data = await res.json().catch(function() { return { parseError: true }; });
      setResults(function(p) { return Object.assign({}, p, { [salonId]: { status: res.status, body: data } }); });
    } catch (e) {
      setResults(function(p) { return Object.assign({}, p, { [salonId]: { networkError: String(e) } }); });
    }
    setRunning(function(p) { return Object.assign({}, p, { [salonId]: false }); });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1A1A1A", color: "#fff", padding: 24, fontFamily: "monospace" }}>
      <h2 style={{ color: "#C9A84C" }}>Device secret backfill</h2>
      <p style={{ color: "#999", fontSize: 13 }}>Temporary debug page. Run this once for every salon, then it can be deleted.</p>

      {loading && <p>Loading salons...</p>}

      {salons.map(function(s) {
        var result = results[s.id];
        var isRunning = !!running[s.id];
        var succeeded = result && result.body && result.body.success;
        return (
          <div key={s.id} style={{ marginBottom: 16, padding: 16, background: "#000", border: "1px solid #444", borderRadius: 6 }}>
            <div style={{ marginBottom: 8 }}>
              <b style={{ color: "#fff" }}>{s.name}</b>
              <span style={{ color: "#666", marginLeft: 8, fontSize: 11 }}>{s.id}</span>
            </div>
            <button
              onClick={function() { runFor(s.id); }}
              disabled={isRunning || succeeded}
              style={{
                background: succeeded ? "#1a3d1a" : "#C9A84C",
                color: succeeded ? "#4ADE80" : "#000",
                border: "none", padding: "8px 18px", fontWeight: "bold", cursor: (isRunning || succeeded) ? "default" : "pointer",
              }}
            >
              {isRunning ? "Running..." : succeeded ? "✓ Done" : "Run backfill"}
            </button>
            {result && (
              <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-all", color: succeeded ? "#4ADE80" : "#F87171", fontSize: 12 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
