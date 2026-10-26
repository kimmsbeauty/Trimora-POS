// src/pages/pet/petNav.js
//
// Navigation model for Trimora Pet. Order follows PET_MODULE_SPEC section 4,
// with Checkout directly under Overview.
//
// adminOnly is a UI-level convenience (same split AutoApp uses), NOT security:
// the device session is shared, so the database cannot yet tell staff from
// admin. Do not rely on it to protect sensitive data (see the feasibility
// audit, section 6). Pet roles and database enforcement come in a later phase.
export var PET_NAV = [
  { key: "overview", label: "Overview", icon: "overview", adminOnly: false },
  { key: "checkout", label: "Checkout", icon: "checkout", adminOnly: false },
  { key: "calendar", label: "Calendar & Bookings", icon: "calendar", adminOnly: false },
  { key: "requests", label: "Online Requests", icon: "requests", adminOnly: false },
  { key: "customers", label: "Customers", icon: "customers", adminOnly: false },
  { key: "pets", label: "Pets", icon: "pets", adminOnly: false },
  { key: "grooming", label: "Grooming", icon: "grooming", adminOnly: false },
  { key: "boarding", label: "Boarding", icon: "boarding", adminOnly: false },
  { key: "invoices", label: "Invoices & Payments", icon: "invoices", adminOnly: false },
  { key: "supplies", label: "Supplies & Inventory", icon: "supplies", adminOnly: false },
  { key: "loyalty", label: "Loyalty Programme", icon: "loyalty", adminOnly: false },
  { key: "reminders", label: "Reminders", icon: "reminders", adminOnly: false },
  { key: "staff", label: "Staff & Permissions", icon: "staff", adminOnly: true },
  { key: "reports", label: "Reports", icon: "reports", adminOnly: true },
  { key: "settings", label: "Settings", icon: "settings", adminOnly: true },
];

export function visiblePetNav(isAdmin) {
  return PET_NAV.filter(function (item) { return !item.adminOnly || !!isAdmin; });
}

export function petInitials(name) {
  var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
