// src/pages/pet/petNav.js
//
// Navigation model for Trimora Pet. Order follows PET_MODULE_SPEC section 4,
// with Checkout directly under Overview.
//
// adminOnly is a UI-level convenience (same split AutoApp uses), NOT security:
// the device session is shared, so the database cannot yet tell staff from
// admin. Do not rely on it to protect sensitive data (see the feasibility
// audit, section 6). Pet roles and database enforcement come in a later phase.
// Sidebar groups, in display order. Each nav item names its group in `section`.
export var PET_NAV_SECTIONS = {
  workspace: "Workspace",
  services: "Customers & Services",
  operations: "Business Operations",
  administration: "Administration",
};

export var PET_NAV = [
  { key: "overview", label: "Overview", icon: "overview", section: "workspace", adminOnly: false },
  { key: "checkout", label: "Checkout", icon: "checkout", section: "workspace", adminOnly: false },
  { key: "calendar", label: "Calendar & Bookings", icon: "calendar", section: "workspace", adminOnly: false },
  { key: "requests", label: "Online Requests", icon: "requests", section: "workspace", adminOnly: false },
  { key: "customers", label: "Customers", icon: "customers", section: "services", adminOnly: false },
  { key: "pets", label: "Pets", icon: "pets", section: "services", adminOnly: false },
  { key: "grooming", label: "Grooming", icon: "grooming", section: "services", adminOnly: false },
  { key: "boarding", label: "Boarding", icon: "boarding", section: "services", adminOnly: false },
  { key: "invoices", label: "Invoices & Payments", icon: "invoices", section: "operations", adminOnly: false },
  { key: "supplies", label: "Supplies & Inventory", icon: "supplies", section: "operations", adminOnly: false },
  { key: "loyalty", label: "Loyalty Programme", icon: "loyalty", section: "operations", adminOnly: false },
  { key: "reminders", label: "Reminders", icon: "reminders", section: "operations", adminOnly: false },
  { key: "staff", label: "Staff & Permissions", icon: "staff", section: "administration", adminOnly: true },
  { key: "reports", label: "Reports", icon: "reports", section: "administration", adminOnly: true },
  { key: "settings", label: "Settings", icon: "settings", section: "administration", adminOnly: true },
];

export function visiblePetNav(isAdmin) {
  return PET_NAV.filter(function (item) { return !item.adminOnly || !!isAdmin; });
}

// Group a (possibly role-filtered) nav list for display: consecutive items sharing a section become
// one group with that section's label. A section with no visible items disappears, so staff never
// see an empty "Administration" heading. Items with no known section land in an unlabelled group.
export function groupPetNav(nav) {
  var groups = [];
  (nav || []).forEach(function (item) {
    var label = PET_NAV_SECTIONS[item.section] || null;
    var last = groups[groups.length - 1];
    if (last && last.section === (item.section || null)) last.items.push(item);
    else groups.push({ section: item.section || null, label: label, items: [item] });
  });
  return groups;
}

export function petInitials(name) {
  var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
