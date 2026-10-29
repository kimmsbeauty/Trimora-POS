// src/pages/PetApp.jsx
//
// Entry point for Trimora Pet (third business type), mirroring AutoApp.jsx:
// same shared LoginPage (device-session PIN auth, no Pet-specific auth),
// same module gate. ModuleGate checks salon_enabled_modules for
// module_key='pet' before showing anything, so a business without Pet sees a
// calm message instead of a broken screen.
//
// Phase 1 scope: gate, login, shell and navigation. Phase 2 adds the real Pets
// screen (pet_pets / pet_vaccinations); Phase 3 adds the real Customers
// screen (customers + pet_customer_profiles); Phase 4 adds the Grooming
// service catalogue (pet_services); Phase 5 adds Staff & Permissions
// (admin-defined roles, pet_roles / pet_staff_roles). Every other section is still an honest
// "coming soon" placeholder -- no mock data. Overview is now real: it only reads
// existing records and acts through the same pet_* functions as the other screens.
//
// NOTE on roles: LoginPage's onLogin(role) gives "staff" or "admin". The
// adminOnly flags in pet/petNav.js only HIDE navigation. They are not access
// control: the database cannot yet tell staff from admin (shared device
// session). Phase 5 records roles but does not enforce them. No sensitive Pet
// data exists yet; before medical notes or unrestricted financial actions ship,
// per-person enforcement must exist in the database (see the feasibility
// audit, section 6).

import { useState, useEffect } from "react";
import LoginPage from "./LoginPage";
import PetShell from "./pet/PetShell";
import useNewRequestCount from "./pet/useNewRequestCount";
import PlaceholderPage from "./pet/PlaceholderPage";
import RemindersPage from "./pet/RemindersPage";
import BookingRequestsPage from "./pet/BookingRequestsPage";
import PetsPage from "./pet/PetsPage";
import CustomersPage from "./pet/CustomersPage";
import GroomingPage from "./pet/GroomingPage";
import CalendarPage from "./pet/CalendarPage";
import CheckoutPage from "./pet/CheckoutPage";
import InvoicesPage from "./pet/InvoicesPage";
import SettingsPage from "./pet/SettingsPage";
import SuppliesPage from "./pet/SuppliesPage";
import StaffPage from "./pet/StaffPage";
import BoardingPage from "./pet/BoardingPage";
import DaycarePage from "./pet/DaycarePage";
import ReportsPage from "./pet/ReportsPage";
import LoyaltyPage from "./pet/LoyaltyPage";
import OverviewPage from "./pet/OverviewPage";
import WorkingAs from "./pet/WorkingAs";
import InstallAppButton from "./pet/InstallAppButton";
import { setPetPwaManifest } from "../lib/pwaManifest";
import { registerServiceWorker } from "../lib/registerServiceWorker";
import { startInstallListeners } from "../lib/installPrompt";
import { clearPetActor } from "../lib/petActor";
import { visiblePetNav } from "./pet/petNav";
import "./pet/fonts";
import { useSalon } from "../lib/SalonContext";
import { db } from "../lib/db";
import {
  PET_NAME, PET_MODULE_KEY, SIDEBAR, SIDEBAR_FG, SIDEBAR_MUTED, PRIMARY, PRIMARY_FG,
  FONT_BODY, FONT_HEADING,
} from "./pet/theme";

var PHASES = {};

function CenteredMessage({ title, body, action }) {
  return (
    <div style={{
      minHeight: "100vh", background: SIDEBAR, color: SIDEBAR_FG, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, textAlign: "center", fontFamily: FONT_BODY,
    }}>
      <div style={{ fontFamily: FONT_HEADING, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: SIDEBAR_MUTED, maxWidth: 340, lineHeight: 1.6 }}>{body}</div>
      {action}
    </div>
  );
}

function ModuleGate({ children }) {
  var salon = useSalon();
  var salonId = salon && salon.id;
  var statusState = useState("checking");
  var status = statusState[0]; var setStatus = statusState[1];
  var attemptState = useState(0);
  var attempt = attemptState[0]; var setAttempt = attemptState[1];

  useEffect(function () {
    if (!salonId) return;
    var cancelled = false;
    setStatus("checking");
    db("GET", "salon_enabled_modules", null, "?module_key=eq." + PET_MODULE_KEY + "&enabled=eq.true").then(
      function (rows) {
        if (cancelled) return;
        // db() returns null when the request itself failed. That is not the
        // same as "module is off", so don't tell the user it's switched off.
        if (rows === null || rows === undefined) { setStatus("error"); return; }
        setStatus(rows.length > 0 ? "enabled" : "disabled");
      }
    );
    return function () { cancelled = true; };
  }, [salonId, attempt]);

  if (status === "checking") {
    return <div style={{ minHeight: "100vh", background: SIDEBAR }} />;
  }
  if (status === "disabled") {
    return (
      <CenteredMessage
        title={PET_NAME + " isn't turned on for this business yet"}
        body="Ask your Trimora account owner to enable it, or reach out to Trimora support."
      />
    );
  }
  if (status === "error") {
    return (
      <CenteredMessage
        title="Couldn't check this business"
        body="We couldn't confirm whether Trimora Pet is on. Check your connection and try again."
        action={
          <button type="button" onClick={function () { setAttempt(attempt + 1); }} style={{
            marginTop: 16, background: PRIMARY, color: PRIMARY_FG, border: "none", borderRadius: 10,
            padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>Try again</button>
        }
      />
    );
  }
  return children;
}

function PetStaffRoute() {
  var salon = useSalon();
  var loggedInState = useState(false);
  var loggedIn = loggedInState[0]; var setLoggedIn = loggedInState[1];
  var isAdminState = useState(false);
  var isAdmin = isAdminState[0]; var setIsAdmin = isAdminState[1];
  var tabState = useState("overview");
  var tab = tabState[0]; var setTab = tabState[1];
  var openInvoiceState = useState(null);
  var openInvoice = openInvoiceState[0]; var setOpenInvoice = openInvoiceState[1];
  // Where an Overview shortcut should land (e.g. the calendar's day view). Cleared by any other navigation.
  var intentState = useState(null);
  var intent = intentState[0]; var setIntent = intentState[1];
  // Badge on "Online Requests": hook must run before the login early-return below.
  var newRequests = useNewRequestCount(loggedIn, tab);
  function selectTab(key) { setIntent(null); setTab(key); }
  function goFromOverview(key, opts) { setIntent(opts || null); setTab(key); }

  // Make the app installable on a phone: listen for the browser's install offer FIRST (it only
  // fires once the manifest exists), then publish this business's manifest and register the
  // service worker. Runs on the login screen too, so the offer is never missed.
  var salonSlug = salon && salon.slug; var salonName = salon && salon.name;
  useEffect(function () {
    if (!salon) return;
    startInstallListeners();
    setPetPwaManifest(salon);
    registerServiceWorker();
  }, [salonSlug, salonName]);

  if (!loggedIn) {
    return <LoginPage isPet={true} onLogin={function (role) { setIsAdmin(role === "admin"); setLoggedIn(true); }} />;
  }

  var nav = visiblePetNav(isAdmin);
  // If the current tab isn't visible for this role, fall back to Overview.
  var activeItem = nav.filter(function (n) { return n.key === tab; })[0] || nav[0];

  return (
    <PetShell
      nav={nav}
      active={activeItem.key}
      onSelect={selectTab}
      badges={{ requests: newRequests }}
      businessName={salon && salon.name}
      roleLabel={isAdmin ? "Admin" : "Staff"}
      footerSlot={<><InstallAppButton /><WorkingAs /></>}
      onLogout={function () { clearPetActor(); setLoggedIn(false); setIsAdmin(false); setIntent(null); setTab("overview"); }}
    >
      {activeItem.key === "overview"
        ? <OverviewPage businessName={salon && salon.name} isAdmin={isAdmin} onNavigate={goFromOverview} />
        : activeItem.key === "pets"
        ? <PetsPage startNew={!!(intent && intent.startNew)} isAdmin={isAdmin} />
        : activeItem.key === "customers"
        ? <CustomersPage />
        : activeItem.key === "grooming"
        ? <GroomingPage canEdit={isAdmin} />
        : activeItem.key === "calendar"
        ? <CalendarPage initialView={intent && intent.view} startNew={!!(intent && intent.startNew)} openBookingId={intent && intent.bookingId} />
        : activeItem.key === "checkout"
        ? <CheckoutPage onInvoiceCreated={function (id) { setOpenInvoice(id); setTab("invoices"); }} />
        : activeItem.key === "invoices"
        ? <InvoicesPage openInvoiceId={openInvoice} onDetailClosed={function () { setOpenInvoice(null); }} initialStatus={intent && intent.status} />
        : activeItem.key === "supplies"
        ? <SuppliesPage canEdit={isAdmin} />
        : activeItem.key === "settings"
        ? <SettingsPage />
        : activeItem.key === "loyalty"
        ? <LoyaltyPage canEdit={isAdmin} />
        : activeItem.key === "reports"
        ? <ReportsPage />
        : activeItem.key === "boarding"
        ? <BoardingPage canEdit={isAdmin} />
        : activeItem.key === "daycare"
        ? <DaycarePage canEdit={isAdmin} onOpenInvoice={function (id) { setOpenInvoice(id); setTab("invoices"); }} />
        : activeItem.key === "reminders"
        ? <RemindersPage />
        : activeItem.key === "requests"
        ? <BookingRequestsPage />
        : activeItem.key === "staff"
        ? <StaffPage canEdit={isAdmin} />
        : <PlaceholderPage title={activeItem.label} phase={PHASES[activeItem.key]} />}
    </PetShell>
  );
}

export default function PetApp() {
  return (
    <ModuleGate>
      <PetStaffRoute />
    </ModuleGate>
  );
}
