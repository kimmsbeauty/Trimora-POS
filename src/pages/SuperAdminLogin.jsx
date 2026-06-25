// src/pages/SuperAdminLogin.jsx

import { useState } from "react";
import { superAdminLogin } from "../lib/superAdminAuth";
import { BLACK, GOLD, GOLD_DIM, WHITE, RED, DARK } from "../lib/constants";

export default function SuperAdminLogin({ onSuccess }) {
  var [email,    setEmail]    = useState("");
  var [password, setPassword] = useState("");
  var [error,    setError]    = useState("");
  var [loading,  setLoading]  = useState(false);

  async function handleLogin() {
    if (!email || !password) return setError("Please enter email and password.");
    setLoading(true);
    setError("");
    var result = await superAdminLogin(email, password);
    setLoading(false);
    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0A0A0A 0%, #1A1A1A 60%, #222 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1.5px solid " + GOLD_DIM + "55",
        borderRadius: 24, padding: 40,
        maxWidth: 360, width: "100%",
        textAlign: "center",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
        {/* Logo */}
        <div style={{ fontSize: 28, fontWeight: 900, color: GOLD, letterSpacing: "0.12em", marginBottom: 4 }}>
          TRIMORA
        </div>
        <div style={{ fontSize: 11, color: GOLD_DIM, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 28 }}>
          Super Admin Console
        </div>

        <div style={{ borderTop: "1px solid " + GOLD_DIM + "33", marginBottom: 24 }} />

        <input
          type="email"
          placeholder="Admin email"
          value={email}
          onChange={function(e) { setEmail(e.target.value); setError(""); }}
          onKeyDown={function(e) { if (e.key === "Enter") handleLogin(); }}
          disabled={loading}
          style={{
            width: "100%", borderRadius: 10,
            border: "1.5px solid " + (error ? RED : GOLD_DIM + "44"),
            background: "rgba(255,255,255,0.05)",
            padding: "13px 14px", fontSize: 14,
            boxSizing: "border-box", fontFamily: "inherit",
            outline: "none", color: WHITE, marginBottom: 10,
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={function(e) { setPassword(e.target.value); setError(""); }}
          onKeyDown={function(e) { if (e.key === "Enter") handleLogin(); }}
          disabled={loading}
          style={{
            width: "100%", borderRadius: 10,
            border: "1.5px solid " + (error ? RED : GOLD_DIM + "44"),
            background: "rgba(255,255,255,0.05)",
            padding: "13px 14px", fontSize: 14,
            boxSizing: "border-box", fontFamily: "inherit",
            outline: "none", color: WHITE, marginBottom: 12,
          }}
        />

        {error && (
          <div style={{
            color: RED, fontSize: 12, marginBottom: 12,
            padding: "8px 12px", background: "rgba(239,68,68,0.1)",
            borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)",
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%", background: GOLD, color: BLACK,
            border: "none", borderRadius: 10,
            padding: "14px 0", fontWeight: 900, fontSize: 15,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in..." : "Sign In →"}
        </button>

        <div style={{ fontSize: 10, color: GOLD_DIM + "88", marginTop: 20 }}>
          Trimora Systems · Admin Access Only
        </div>
      </div>
    </div>
  );
}
