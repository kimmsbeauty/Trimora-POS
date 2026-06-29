// src/App.jsx
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import BookingPage from "./pages/BookingPage";
import POSApp from "./pages/POSApp";
import SalonBrandmark from "./components/SalonBrandmark";
import LoginPage from "./pages/LoginPage";
import RatingPage from "./pages/RatingPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ResetPinPage from "./pages/ResetPinPage";
import ForgotPinPage from "./pages/ForgotPinPage";
import DebugPinTest from "./pages/DebugPinTest";
import DebugBackfillSecrets from "./pages/DebugBackfillSecrets";
import TermsPage from "./pages/TermsPage";
import SuperAdminGate from "./pages/SuperAdminGate";
import OnboardingPage from "./pages/OnboardingPage";
import { getDeviceLoginStatus, silentDeviceLogin } from "./lib/deviceAuth";
import { SalonGate, fetchPublicSalonBranding } from "./lib/SalonContext";

function RedirectToBooking() {
  useEffect(function() {
    // Supabase always lands recovery emails on the site root regardless of redirectTo.
    // The token can arrive in the hash (most cases) OR as query params (some email
    // clients strip the hash before following the link). Check both.
    var hash   = window.location.hash || "";
    var search = window.location.search || "";

    // Parse token from hash: #access_token=xxx&type=recovery
    var hashParams  = new URLSearchParams(hash.replace(/^#/, ""));
    // Parse token from query string: ?access_token=xxx&type=recovery
    var searchParams = new URLSearchParams(search.replace(/^\?/, ""));

    var isRecovery = (
      (hashParams.get("type") === "recovery" && hashParams.get("access_token")) ||
      (searchParams.get("type") === "recovery" && searchParams.get("access_token"))
    );

    if (isRecovery) {
      var pinSlug = window.localStorage.getItem("trimora_pin_reset_slug");
      if (pinSlug) {
        // PIN reset — embed slug in the forward path so ResetPinPage gets it via useParams
        var pinPath = (pinSlug && pinSlug !== "__noslug__") ? "/reset-pin/" + pinSlug : "/reset-pin";
        window.location.href = pinPath + hash;
      } else {
        var pwSlug = window.localStorage.getItem("trimora_password_reset_slug");
        var validPwSlug = pwSlug && /^[a-z0-9][a-z0-9-]{2,}$/.test(pwSlug) ? pwSlug : "";
        var pwPath = validPwSlug ? "/reset-password/" + validPwSlug : "/reset-password";
        window.location.href = pwPath + hash;
      }
      return;
    }
    window.location.href = "/booking";
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0A0A0A 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <SalonBrandmark salon={null} size="md" />
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>Redirecting...</div>
    </div>
  );
}

function DeviceGate({ children }) {
  var params = useParams();
  var slug = params.slug;

  var statusState = useState("checking");
  var status      = statusState[0]; var setStatus = statusState[1];

  var errorState = useState("");
  var error      = errorState[0]; var setError = errorState[1];

  useEffect(function() {
    var cancelled = false;

    async function check() {
      var loginStatus = getDeviceLoginStatus();
      if (loginStatus === "active") {
        if (!cancelled) setStatus("ok");
        return;
      }

      // No human-facing login screen anymore - resolve the salon from the
      // URL slug (works even with no session yet, same public lookup the
      // booking page uses) and silently establish a device session.
      var salon = await fetchPublicSalonBranding(slug);
      if (cancelled) return;

      if (!salon || !salon.id) {
        setStatus("error");
        setError("Could not find this salon. Please check the link and try again.");
        return;
      }

      var result = await silentDeviceLogin(salon.id);
      if (cancelled) return;

      if (result.ok) {
        setStatus("ok");
      } else {
        setStatus("error");
        setError(result.error || "Could not connect. Please contact support.");
      }
    }

    check();
    var interval = setInterval(check, 5 * 60 * 1000);
    return function() { cancelled = true; clearInterval(interval); };
  }, [slug]);

  if (status === "checking") return null;

  if (status === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "sans-serif", background: "#1A1400", color: "#fff" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ marginBottom: 8 }}>Could not connect</h2>
        <p style={{ color: "#ccc", maxWidth: 320 }}>{error}</p>
      </div>
    );
  }

  return children;
}

function StaffRoute() {
  var loggedInState = useState(false); var loggedIn = loggedInState[0]; var setLoggedIn = loggedInState[1];
  var userRoleState = useState("staff"); var userRole = userRoleState[0]; var setUserRole = userRoleState[1];
  if (!loggedIn) {
    return <LoginPage onLogin={function(role) { setUserRole(role); setLoggedIn(true); }} />;
  }
  return <POSApp onLogout={function() { setLoggedIn(false); setUserRole("staff"); }} userRole={userRole} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<RedirectToBooking />} />
        <Route path="/booking"     element={<BookingPage />} />
        <Route path="/pos"         element={<DeviceGate><StaffRoute /></DeviceGate>} />
        <Route path="/rate/:token" element={<RatingPage />} />
        <Route path="/onboard"                element={<OnboardingPage />} />
        <Route path="/terms"                  element={<TermsPage />} />
        <Route path="/superadmin"             element={<SuperAdminGate />} />
        <Route path="/reset-password"           element={<ResetPasswordPage />} />
        <Route path="/reset-password/:slug"     element={<ResetPasswordPage />} />
        <Route path="/reset-pin"              element={<ResetPinPage />} />
        <Route path="/reset-pin/:slug"        element={<ResetPinPage />} />
        <Route path="/:slug/forgot-password"  element={<ForgotPasswordPage />} />
        <Route path="/forgot-password"        element={<ForgotPasswordPage />} />
        <Route path="/:slug/forgot-pin"       element={<ForgotPinPage />} />
        <Route path="/forgot-pin"             element={<ForgotPinPage />} />
        <Route path="/debug-pin-test"         element={<DebugPinTest />} />
        <Route path="/debug-backfill-secrets" element={<DebugBackfillSecrets />} />

        <Route path="/:slug/booking" element={<SalonGate mode="public"><BookingPage /></SalonGate>} />
        <Route path="/:slug/rate/:token" element={<SalonGate mode="public"><RatingPage /></SalonGate>} />
        <Route path="/:slug/pos" element={<DeviceGate><SalonGate mode="authenticated"><StaffRoute /></SalonGate></DeviceGate>} />

        <Route path="*"            element={<RedirectToBooking />} />
      </Routes>
    </BrowserRouter>
  );
}
