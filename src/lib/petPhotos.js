// src/lib/petPhotos.js
//
// Pet photos (migration 109): a private 'pet-photos' storage bucket plus a pet_photos row per
// photo. Same approach as lib/vehiclePhotos.js (raw fetch against the Storage REST API, signed
// URLs because the bucket is private). Object keys are {salon_id}/{pet_id}/{timestamp}-{name}.
import { SUPABASE_URL, SUPABASE_KEY } from "./constants";
import { getValidAccessToken } from "./deviceAuth";
import { getCurrentSalonId } from "./currentSalon";
import { db } from "./db";

var BUCKET = "pet-photos";
var MAX_BYTES = 8 * 1024 * 1024;
var ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function authHeaders(extra) {
  var token = await getValidAccessToken();
  return Object.assign({ apikey: SUPABASE_KEY, Authorization: "Bearer " + (token || SUPABASE_KEY) }, extra || {});
}

function sanitizeFilename(name) {
  return (name || "photo").toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
}

export function validatePetPhoto(file) {
  if (!file) return "No file selected.";
  if (ALLOWED_TYPES.indexOf(file.type) === -1) return "Please choose a JPEG, PNG, WEBP or HEIC photo.";
  if (file.size > MAX_BYTES) return "Photo is too large (max 8MB).";
  return null;
}

// Uploads the file, then records it. Returns the new row; throws with a readable message.
export async function uploadPetPhoto(petId, file) {
  var invalid = validatePetPhoto(file);
  if (invalid) throw new Error(invalid);
  var salonId = getCurrentSalonId();
  if (!salonId) throw new Error("No active business context.");
  var path = salonId + "/" + petId + "/" + Date.now() + "-" + sanitizeFilename(file.name);
  var up = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST", headers: await authHeaders({ "Content-Type": file.type }), body: file,
  });
  if (!up.ok) {
    var text = await up.text().catch(function () { return ""; });
    throw new Error("Upload failed: " + (text || up.status));
  }
  var rows = await db("POST", "pet_photos", { pet_id: petId, storage_path: path });
  if (!Array.isArray(rows) || !rows[0]) {
    // keep storage tidy: the file has no record, so remove it
    fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path, { method: "DELETE", headers: await authHeaders() }).catch(function () {});
    throw new Error("Photo uploaded but couldn't be saved to the pet's record.");
  }
  return rows[0];
}

// Newest first: [{ id, storage_path, created_at, url }] with url a 1-hour signed link (null if signing failed).
// Returns null when the photos table can't be read (for example the migration is not applied yet).
export async function listPetPhotos(petId) {
  var rows = await db("GET", "pet_photos", null, "?pet_id=eq." + petId + "&order=created_at.desc");
  if (!Array.isArray(rows)) return null;
  if (rows.length === 0) return [];
  var headers = await authHeaders({ "Content-Type": "application/json" });
  return Promise.all(rows.map(async function (row) {
    try {
      var res = await fetch(SUPABASE_URL + "/storage/v1/object/sign/" + BUCKET + "/" + row.storage_path, {
        method: "POST", headers: headers, body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (!res.ok) return Object.assign({ url: null }, row);
      var signed = await res.json();
      return Object.assign({ url: SUPABASE_URL + "/storage/v1" + signed.signedURL }, row);
    } catch (e) { return Object.assign({ url: null }, row); }
  }));
}

export async function deletePetPhoto(photo) {
  var ok = await db("DELETE", "pet_photos", null, "?id=eq." + photo.id);
  if (ok === null || ok === undefined || ok === false) throw new Error("Couldn't delete this photo.");
  await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + photo.storage_path, { method: "DELETE", headers: await authHeaders() })
    .catch(function () { /* the record is gone; a stray private file is only a clean-up matter */ });
}
