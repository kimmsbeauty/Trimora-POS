// src/components/VehiclePhotoUpload.jsx
//
// Reusable vehicle photo gallery: shows existing photos for a vehicle
// and an optional "Add photo" control. Used from both CheckInPage.jsx
// and BoardPage.jsx (per explicit direction: available in both places,
// always optional -- never required to proceed with check-in or any
// board action).
//
// Vehicle-level gallery only, not job-specific (see lib/vehiclePhotos.js
// header for the full reasoning) -- so the same gallery is shown
// regardless of which job/visit this is opened from.

import { useState, useEffect, useCallback } from "react";
import { uploadVehiclePhoto, listVehiclePhotos, deleteVehiclePhoto, validatePhotoFile } from "../lib/vehiclePhotos";
import { CHROME, SIGNAL, ALERT } from "../pages/auto/theme";

export default function VehiclePhotoUpload({ vehicleId }) {
  var photosState = useState([]); var photos = photosState[0]; var setPhotos = photosState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var uploadingState = useState(false); var uploading = uploadingState[0]; var setUploading = uploadingState[1];
  var errorState = useState(null); var error = errorState[0]; var setError = errorState[1];
  var viewerState = useState(null); var viewerUrl = viewerState[0]; var setViewerUrl = viewerState[1];

  var load = useCallback(async function () {
    if (!vehicleId) return;
    setLoading(true);
    var rows = await listVehiclePhotos(vehicleId).catch(function () { return []; });
    setPhotos(rows);
    setLoading(false);
  }, [vehicleId]);

  useEffect(function () { load(); }, [load]);

  async function handleFileChange(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    var invalid = validatePhotoFile(file);
    if (invalid) { setError(invalid); return; }
    setError(null);
    setUploading(true);
    try {
      await uploadVehiclePhoto(vehicleId, file);
      await load();
    } catch (err) {
      setError((err && err.message) || "Upload failed. Please try again.");
    }
    setUploading(false);
  }

  async function handleDelete(photo, e) {
    e.stopPropagation();
    if (!window.confirm("Delete this photo?")) return;
    await deleteVehiclePhoto(photo).catch(function () { setError("Couldn't delete this photo."); });
    load();
  }

  if (!vehicleId) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME }}>
          Photos {photos.length > 0 ? "(" + photos.length + ")" : ""}
        </span>
        <label style={{
          fontSize: 12, fontWeight: 700, color: SIGNAL, cursor: uploading ? "default" : "pointer",
          opacity: uploading ? 0.6 : 1,
        }}>
          {uploading ? "Uploading…" : "+ Add photo"}
          <input type="file" accept="image/*" capture="environment" onChange={handleFileChange}
            disabled={uploading} style={{ display: "none" }} />
        </label>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: ALERT, marginBottom: 8 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: CHROME }}>Loading photos…</div>
      ) : photos.length === 0 ? (
        <div style={{ fontSize: 12, color: CHROME }}>No photos yet for this vehicle.</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photos.map(function (p) {
            return (
              <div key={p.id} onClick={function () { if (p.url) setViewerUrl(p.url); }}
                style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", cursor: p.url ? "pointer" : "default", background: "rgba(255,255,255,0.04)" }}>
                {p.url ? (
                  <img src={p.url} alt="Vehicle" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: CHROME }}>
                    Unavailable
                  </div>
                )}
                <button onClick={function (e) { handleDelete(p, e); }} title="Delete photo" style={{
                  position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9,
                  border: "none", background: "rgba(10,10,10,0.7)", color: ALERT, fontSize: 11, fontWeight: 800,
                  cursor: "pointer", lineHeight: "18px", padding: 0,
                }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {viewerUrl && (
        <div onClick={function () { setViewerUrl(null); }} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <img src={viewerUrl} alt="Vehicle full size" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
