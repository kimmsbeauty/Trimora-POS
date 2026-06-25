// src/pages/SuperAdminGate.jsx
//
// Top-level wrapper for the /superadmin route.
// Shows login if not authenticated, dashboard if authenticated.

import { useState } from "react";
import { isSuperAdminLoggedIn } from "../lib/superAdminAuth";
import SuperAdminLogin from "./SuperAdminLogin";
import SuperAdminDashboard from "./SuperAdminDashboard";

export default function SuperAdminGate() {
  var [authed, setAuthed] = useState(isSuperAdminLoggedIn());

  if (!authed) {
    return <SuperAdminLogin onSuccess={function() { setAuthed(true); }} />;
  }

  return <SuperAdminDashboard onLogout={function() { setAuthed(false); }} />;
}
