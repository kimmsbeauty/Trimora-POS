// src/lib/petActor.js
//
// "Who is working" on a shared Pet device. Login is the shared device PIN session, so the
// database cannot tell staff members apart. This remembers which staff member the person at
// the device picked, so db.js can send it as an X-Pet-Actor header and the audit trigger
// (migration 087) can record it.
//
// This is ATTRIBUTION, not authentication: the server only checks the id belongs to a staff
// row of the same business, and marks the audit row actor_asserted. Stored in sessionStorage
// so it ends with the tab and is never shared across devices.

var KEY = "trimora_pet_actor";
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getPetActor() {
  try {
    var v = sessionStorage.getItem(KEY);
    return v && UUID.test(v) ? v : null;
  } catch (e) { return null; }
}

export function setPetActor(staffId) {
  try {
    if (staffId && UUID.test(staffId)) sessionStorage.setItem(KEY, staffId);
    else sessionStorage.removeItem(KEY);
  } catch (e) { /* storage unavailable: attribution simply stays off */ }
}

export function clearPetActor() { setPetActor(null); }
