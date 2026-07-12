// src/lib/vehiclePhotos.js
//
// First-ever file/Storage upload in this codebase. Deliberately built
// as raw fetch() against the Supabase Storage REST API, matching this
// project's existing db.js pattern -- @supabase/supabase-js is a listed
// package.json dependency but is explicitly NOT used anywhere in this
// codebase (see the header comment in lib/slugify.js), and introducing
// its client here for the first time would break that established
// convention rather than extend it.
//
// Scope (per explicit direction): vehicle-level photo gallery only.
// vehicle_photos has no job_id or photo_type column -- photos live on
// the vehicle's permanent record, not tied to a specific visit/job or
// labeled before/after. Confirmed live before writing this: table
// columns (id, salon_id, vehicle_id, storage_path, uploaded_by,
// created_at), RLS (select/insert/delete all gated on
// salon_id = auth_salon_id()), and the storage.objects policies on the
// 'vehicle-photos' bucket (private, gated on
// storage.foldername(name)[1] = auth_salon_id() -- i.e. the first path
// segment of the object key must be the salon's own UUID).
//
// uploaded_by is left null on every insert -- there is no persistent
// "current staff" session concept anywhere in this codebase (PIN auth
// is verified per-transaction, not stored as an ongoing identity), so
// there is nothing real to populate that column with.

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";
import { getValidAccessToken } from "./deviceAuth";
import { getCurrentSalonId } from "./currentSalon";
import { db } from "./db";

var BUCKET = "vehicle-photos";
var MAX_BYTES = 8 * 1024 * 1024; // 8MB -- generous for a phone camera photo, not so large it stalls on a weak connection
var ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function authHeaders(extra) {
  var token = await getValidAccessToken();
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + (token || SUPABASE_KEY),
  }, extra || {});
}

function sanitizeFilename(name) {
  return (name || "photo").toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
}

export function validatePhotoFile(file) {
  if (!file) return "No file selected.";
  if (ALLOWED_TYPES.indexOf(file.type) === -1) return "Please choose a JPEG, PNG, WEBP, or HEIC photo.";
  if (file.size > MAX_BYTES) return "Photo is too large (max 8MB).";
  return null;
}

// Uploads the file to Storage, then inserts the vehicle_photos row.
// Returns the new row on success, throws on failure (caller shows the
// error -- upload is optional everywhere it's used, so a failure here
// should never block the surrounding flow, only surface a message).
export async function uploadVehiclePhoto(vehicleId, file) {
  var invalid = validatePhotoFile(file);
  if (invalid) throw new Error(invalid);

  var salonId = getCurrentSalonId();
  if (!salonId) throw new Error("No active salon context.");

  var path = salonId + "/" + vehicleId + "/" + Date.now() + "-" + sanitizeFilename(file.name);

  var uploadRes = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": file.type }),
    body: file,
  });
  if (!uploadRes.ok) {
    var text = await uploadRes.text().catch(function () { return ""; });
    throw new Error("Upload failed: " + (text || uploadRes.status));
  }

  var rows = await db("POST", "vehicle_photos", {
    vehicle_id: vehicleId,
    storage_path: path,
  });
  if (!rows || !rows[0]) throw new Error("Photo uploaded but couldn't be saved to the vehicle's record.");
  return rows[0];
}

// Returns [{ id, storage_path, created_at, url }] for a vehicle,
// newest first. url is a short-lived signed URL (1hr) since the
// bucket is private -- generated fresh on every call rather than
// cached, since these expire.
export async function listVehiclePhotos(vehicleId) {
  var rows = await db("GET", "vehicle_photos", null,
    "?vehicle_id=eq." + vehicleId + "&order=created_at.desc");
  if (!rows || rows.length === 0) return [];

  var headers = await authHeaders({ "Content-Type": "application/json" });
  var withUrls = await Promise.all(rows.map(async function (row) {
    try {
      var signRes = await fetch(SUPABASE_URL + "/storage/v1/object/sign/" + BUCKET + "/" + row.storage_path, {
        method: "POST", headers: headers, body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (!signRes.ok) return Object.assign({ url: null }, row);
      var signed = await signRes.json();
      return Object.assign({ url: SUPABASE_URL + "/storage/v1" + signed.signedURL }, row);
    } catch (e) {
      return Object.assign({ url: null }, row);
    }
  }));
  return withUrls;
}

export async function deleteVehiclePhoto(photo) {
  await db("DELETE", "vehicle_photos", null, "?id=eq." + photo.id);
  await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + photo.storage_path, {
    method: "DELETE",
    headers: await authHeaders(),
  }).catch(function () { /* row is already gone; a stray blob is a minor cleanup issue, not worth failing the UI over */ });
}
