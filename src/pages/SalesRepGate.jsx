// src/pages/SalesRepGate.jsx
//
// Top-level wrapper for the /sales route.
// Shows login if not authenticated, dashboard if authenticated.

import { useState } from "react";
import { isSalesRepLoggedIn } from "../lib/salesRepAuth";
import SalesRepLogin from "./SalesRepLogin";
import SalesRepDashboard from "./SalesRepDashboard";

export default function SalesRepGate() {
  var [authed, setAuthed] = useState(isSalesRepLoggedIn());

  if (!authed) {
    return <SalesRepLogin onSuccess={function() { setAuthed(true); }} />;
  }

  return <SalesRepDashboard onLogout={function() { setAuthed(false); }} />;
}
