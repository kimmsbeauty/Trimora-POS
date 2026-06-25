// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import BookingPage from "./pages/BookingPage";
import POSApp from "./pages/POSApp";
import SalonBrandmark from "./components/SalonBrandmark";
import LoginPage from "./pages/LoginPage";
import RatingPage from "./pages/RatingPage";
import DeviceLoginPage from "./pages/DeviceLoginPage";
import SuperAdminGate from "./pages/SuperAdminGate";
import OnboardingPage from "./pages/OnboardingPage";
import { getDeviceLoginStatus } from "./lib/deviceAuth";
import { SalonGate } from "./lib/SalonContext";

function RedirectToBooking() {
  useEffect(function() { window.location.href = "/booking"; }, []);
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0A0A0A 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <SalonBrandmark salon={null} size="md" />
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>Redirecting...</div>
    </div>
  );
}

function DeviceGate({ children }) {
  var statusState = useState("checking");
  var status      = statusState[0]; var setStatus = statusState[1];

  var reauthState = useState(false);
  var reauth      = reauthState[0]; var setReauth = reauthState[1];

  function check() {
    var loginStatus = getDeviceLoginStatus();
    if (loginStatus === "active") {
      setStatus("ok");
    } else {
      setReauth(loginStatus === "expired");
      setStatus("needs-login");
    }
  }

  useEffect(function() {
    check();
    var interval = setInterval(check, 5 * 60 * 1000);
    return function() { clearInterval(interval); };
  }, []);

  if (status === "checking") return null;

  if (status === "needs-login") {
    return <DeviceLoginPage reauth={reauth} onSuccess={function(){ setStatus("ok"); }} />;
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
        <Route path="/onboard"      element={<OnboardingPage />} />
        <Route path="/superadmin"   element={<SuperAdminGate />} />

        <Route path="/:slug/booking" element={<SalonGate mode="public"><BookingPage /></SalonGate>} />
        <Route path="/:slug/rate/:token" element={<SalonGate mode="public"><RatingPage /></SalonGate>} />
        <Route path="/:slug/pos" element={<DeviceGate><SalonGate mode="authenticated"><StaffRoute /></SalonGate></DeviceGate>} />

        <Route path="*"            element={<RedirectToBooking />} />
      </Routes>
    </BrowserRouter>
  );
}
