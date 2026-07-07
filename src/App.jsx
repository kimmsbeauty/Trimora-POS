// src/App.jsx
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import BookingPage from "./pages/BookingPage";
import POSApp from "./pages/POSApp";
import SalonBrandmark from "./components/SalonBrandmark";
import LoginPage from "./pages/LoginPage";
import RatingPage from "./pages/RatingPage";
import TrimoraLandingPage from "./pages/TrimoraLandingPage";
import { getDeviceLoginStatus, silentDeviceLogin, clearDeviceAuth } from "./lib/deviceAuth";
import { SalonGate, fetchPublicSalonBranding } from "./lib/SalonContext";

// Lazily loaded: each of these is visited far less often than booking/POS
// (recovery flows, one-time onboarding, terms, and the super admin console
// — which alone pulls in a ~90KB dashboard). Splitting them out keeps that
// code out of the bundle every ordinary booking/POS visitor downloads;
// React shows the fallback below only for the brief moment their chunk is
// fetched, same UI either way.
var ForgotPasswordPage = lazy(function() { return import("./pages/ForgotPasswordPage"); });
var ResetPasswordPage  = lazy(function() { return import("./pages/ResetPasswordPage"); });
var ResetPinPage       = lazy(function() { return import("./pages/ResetPinPage"); });
var ForgotPinPage      = lazy(function() { return import("./pages/ForgotPinPage"); });
var TermsPage          = lazy(function() { return import("./pages/TermsPage"); });
var SuperAdminGate     = lazy(function() { return import("./pages/SuperAdminGate"); });
var SalesRepGate       = lazy(function() { return import("./pages/SalesRepGate"); });
var OnboardingPage     = lazy(function() { return import("./pages/OnboardingPage"); });

function RouteFallback() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0A0A0A 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <SalonBrandmark salon={null} size="md" />
    </div>
  );
}

function RedirectToBooking() {
  // Checked synchronously on first render (not in an effect) so a normal
  // visit to "/" never flashes a loading state -- this only ever shows
  // anything other than the real landing page when there's an actual
  // recovery token to process.
  var isRecoveryState = useState(function () {
    var hash = window.location.hash || "";
    var search = window.location.search || "";
    var hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    var searchParams = new URLSearchParams(search.replace(/^\?/, ""));
    return !!(
      (hashParams.get("type") === "recovery" && hashParams.get("access_token")) ||
      (searchParams.get("type") === "recovery" && searchParams.get("access_token"))
    );
  });
  var isRecovery = isRecoveryState[0];

  useEffect(function() {
    // Supabase always lands recovery emails on the site root regardless of redirectTo.
    // The token can arrive in the hash (most cases) OR as query params (some email
    // clients strip the hash before following the link). Check both.
    if (!isRecovery) return;

    var hash   = window.location.hash || "";
    var search = window.location.search || "";

    // Parse token from hash: #access_token=xxx&type=recovery
    var hashParams  = new URLSearchParams(hash.replace(/^#/, ""));
    // Parse token from query string: ?access_token=xxx&type=recovery
    var searchParams = new URLSearchParams(search.replace(/^\?/, ""));

    // Primary signal: localStorage marker set by ForgotPinPage/ForgotPasswordPage
    // in the same browser session before sending the email.
    var pinSlug = window.localStorage.getItem("trimora_pin_reset_slug");
    var pwSlug  = window.localStorage.getItem("trimora_password_reset_slug");

    // Secondary signal: the redirectTo path Supabase received.
    // Supabase sometimes preserves it as the "redirect_to" param in the hash.
    var redirectTo = hashParams.get("redirect_to") || searchParams.get("redirect_to") || "";
    var isRedirectToPin = redirectTo.includes("/reset-pin");

    function validSlug(s) { return !!(s && /^[a-z0-9][a-z0-9-]{2,}$/.test(s)); }

    if (pinSlug || isRedirectToPin) {
      // PIN reset flow
      var slug = validSlug(pinSlug) ? pinSlug : "";
      // Try to extract slug from redirectTo path e.g. /reset-pin/urban-streets-beauty
      if (!slug && isRedirectToPin) {
        var match = redirectTo.match(/\/reset-pin\/([a-z0-9][a-z0-9-]{2,})/);
        if (match) slug = match[1];
      }
      var pinPath = slug ? "/reset-pin/" + slug : "/reset-pin";
      window.location.href = pinPath + hash;
    } else {
      // Password reset flow
      var validPwSlug = validSlug(pwSlug) ? pwSlug : "";
      // Try to extract slug from redirectTo path e.g. /reset-password/urban-streets-beauty
      if (!validPwSlug && redirectTo.includes("/reset-password")) {
        var pwMatch = redirectTo.match(/\/reset-password\/([a-z0-9][a-z0-9-]{2,})/);
        if (pwMatch) validPwSlug = pwMatch[1];
      }
      var pwPath = validPwSlug ? "/reset-password/" + validPwSlug : "/reset-password";
      window.location.href = pwPath + hash;
    }
  }, [isRecovery]);

  if (!isRecovery) return <TrimoraLandingPage />;

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
      // Always resolve the salon from the URL first — needed both for the
      // session ownership check and for the silent login call below.
      var salon = await fetchPublicSalonBranding(slug);
      if (cancelled) return;

      if (!salon || !salon.id) {
        setStatus("error");
        setError("Could not find this salon. Please check the link and try again.");
        return;
      }

      var loginStatus = getDeviceLoginStatus();

      // CRITICAL: even if a session exists, verify it belongs to THIS salon.
      // Without this check, a device that previously accessed Salon A would
      // silently serve Salon A's data when a user visits Salon B's URL,
      // because localStorage holds only one session at a time and DeviceGate
      // would find it "active" regardless of which salon it was minted for.
      if (loginStatus === "active") {
        var storedAuth = JSON.parse(localStorage.getItem("trimora_device_auth") || "{}");
        if (!storedAuth.salon_id || storedAuth.salon_id !== salon.id) {
          // Wrong salon's session or legacy session (no salon_id stored) —
          // clear it and force a fresh silent login for this salon.
          clearDeviceAuth();
          loginStatus = "none";
        } else {
          // Session is valid and belongs to this salon.
          if (!cancelled) setStatus("ok");
          return;
        }
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
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/"            element={<RedirectToBooking />} />
        <Route path="/booking"     element={<TrimoraLandingPage />} />
        <Route path="/pos"         element={<TrimoraLandingPage />} />
        <Route path="/rate/:token" element={<RatingPage />} />
        <Route path="/onboard"                element={<OnboardingPage />} />
        <Route path="/terms"                  element={<TermsPage />} />
        <Route path="/superadmin"             element={<SuperAdminGate />} />
        <Route path="/sales"                  element={<SalesRepGate />} />
        <Route path="/reset-password"           element={<ResetPasswordPage />} />
        <Route path="/reset-password/:slug"     element={<ResetPasswordPage />} />
        <Route path="/reset-pin"              element={<ResetPinPage />} />
        <Route path="/reset-pin/:slug"        element={<ResetPinPage />} />
        <Route path="/:slug/forgot-password"  element={<ForgotPasswordPage />} />
        <Route path="/forgot-password"        element={<ForgotPasswordPage />} />
        <Route path="/:slug/forgot-pin"       element={<ForgotPinPage />} />
        <Route path="/forgot-pin"             element={<ForgotPinPage />} />

        <Route path="/:slug/booking" element={<SalonGate mode="public"><BookingPage /></SalonGate>} />
        <Route path="/:slug/rate/:token" element={<SalonGate mode="public"><RatingPage /></SalonGate>} />
        <Route path="/:slug/pos" element={<DeviceGate><SalonGate mode="authenticated"><StaffRoute /></SalonGate></DeviceGate>} />

        <Route path="*"            element={<TrimoraLandingPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
