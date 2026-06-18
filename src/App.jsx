// src/App.jsx

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import BookingPage from "./pages/BookingPage";
import POSApp from "./pages/POSApp";
import KimmsLogo from "./components/KimmsLogo";
import LoginPage from "./pages/LoginPage";
import RatingPage from "./pages/RatingPage";

function RedirectToBooking() {
  useEffect(function() { window.location.href = "/booking"; }, []);
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0A0A0A 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <KimmsLogo size="md" dark={false} />
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>Redirecting...</div>
    </div>
  );
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
        <Route path="/pos"         element={<StaffRoute />} />
        <Route path="/rate/:token" element={<RatingPage />} />
        <Route path="*"            element={<RedirectToBooking />} />
      </Routes>
    </BrowserRouter>
  );
}
