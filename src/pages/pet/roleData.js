// src/pages/pet/roleData.js
//
// Pure helpers for admin-defined staff roles (no network, no React).
// Roles are DATA the business admin manages (pet_roles, migration 086). The
// presets below are only suggestions the admin can add, edit or ignore.
//
// IMPORTANT: these permissions are RECORDED, not yet ENFORCED. The device login
// is shared, so the database cannot tell which staff member is acting.

// key -> label shown in the Staff & Permissions screen. Add keys here when a
// feature ships; a key unknown to this list is kept on the row but not shown.
export var PERMISSIONS = [
  { key: "manage_bookings", label: "Manage bookings and the grooming board" },
  { key: "manage_customers", label: "Add and edit customers and pets" },
  { key: "manage_services", label: "Edit the service catalogue" },
  { key: "take_payments", label: "Take payments and issue invoices" },
  { key: "view_reports", label: "View reports" },
  { key: "manage_staff_roles", label: "Manage roles and assign staff" },
];

function allOn() {
  var o = {};
  PERMISSIONS.forEach(function (p) { o[p.key] = true; });
  return o;
}

function only(keys) {
  var o = {};
  PERMISSIONS.forEach(function (p) { o[p.key] = keys.indexOf(p.key) !== -1; });
  return o;
}

export var PRESETS = [
  { name: "Owner/Admin", description: "Full access, including roles.", permissions: allOn() },
  {
    name: "Manager", description: "Runs the day to day; cannot change roles.",
    permissions: Object.assign(allOn(), { manage_staff_roles: false }),
  },
  { name: "Groomer", description: "Works the grooming board.", permissions: only(["manage_bookings", "manage_customers"]) },
  {
    name: "Receptionist", description: "Front desk: bookings, customers and payments.",
    permissions: only(["manage_bookings", "manage_customers", "take_payments"]),
  },
];

export var MAX_NAME = 60;
export var MAX_DESCRIPTION = 300;

function clean(v) { return typeof v === "string" ? v.trim() : v; }

export function validateRole(draft) {
  var name = clean(draft.name);
  if (!name) return "Role name is required.";
  if (name.length > MAX_NAME) return "Role name must be " + MAX_NAME + " characters or fewer.";
  if (clean(draft.description || "").length > MAX_DESCRIPTION) return "Description must be " + MAX_DESCRIPTION + " characters or fewer.";
  return "";
}

// Form draft -> database row. Only known permission keys are written, always as booleans.
export function roleRow(draft) {
  var perms = {};
  var src = draft.permissions || {};
  PERMISSIONS.forEach(function (p) { perms[p.key] = src[p.key] === true; });
  var desc = clean(draft.description || "");
  return { name: clean(draft.name), description: desc === "" ? null : desc, permissions: perms };
}

export function isDuplicateRole(roles, name, ignoreId) {
  var key = String(name || "").trim().toLowerCase();
  return (roles || []).some(function (r) {
    return r.id !== ignoreId && String(r.name).trim().toLowerCase() === key;
  });
}

// Presets whose name is not already a role in this business.
export function missingPresets(roles) {
  return PRESETS.filter(function (p) { return !isDuplicateRole(roles, p.name, null); });
}

// staff_id -> assignment row ({id, staff_id, role_id}).
export function assignmentByStaff(assignments) {
  var map = {};
  (assignments || []).forEach(function (a) { map[a.staff_id] = a; });
  return map;
}

export function countAssigned(assignments, roleId) {
  return (assignments || []).filter(function (a) { return a.role_id === roleId; }).length;
}

export function permissionSummary(role) {
  var perms = (role && role.permissions) || {};
  var on = PERMISSIONS.filter(function (p) { return perms[p.key] === true; });
  if (on.length === 0) return "No permissions ticked";
  if (on.length === PERMISSIONS.length) return "All permissions";
  return on.length + " of " + PERMISSIONS.length + " permissions";
}

export function sortRoles(list) {
  return (list || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
}
