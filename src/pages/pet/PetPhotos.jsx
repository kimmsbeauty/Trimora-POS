// src/pages/pet/PetPhotos.jsx
//
// Photo gallery on a pet's profile (migration 111): add from the camera or gallery, tap to enlarge,
// delete (admin only, a UI rule like the rest of Pet). Photos are optional and never block anything.
import React, { useEffect, useState } from "react";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import { Button, ErrorLine, Modal } from "./ui";
import { uploadPetPhoto, listPetPhotos, deletePetPhoto, validatePetPhoto } from "../../lib/petPhotos";

export default function PetPhotos({ petId, canDelete }) {
  var photosState = useState(null); var photos = photosState[0]; var setPhotos = photosState[1]; // null = loading
  var unavailState = useState(false); var unavailable = unavailState[0]; var setUnavailable = unavailState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var viewState = useState(null); var viewing = viewState[0]; var setViewing = viewState[1];
  var delState = useState(null); var confirmDel = delState[0]; var setConfirmDel = delState[1];

  function load() {
    return listPetPhotos(petId).then(function (rows) {
      if (rows === null) { setUnavailable(true); setPhotos([]); return; }
      setUnavailable(false); setPhotos(rows);
    }).catch(function () { setUnavailable(true); setPhotos([]); });
  }
  useEffect(function () { setPhotos(null); load(); }, [petId]);

  async function onPick(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || busy) return;
    var bad = validatePetPhoto(file);
    if (bad) { setErr(bad); return; }
    setBusy(true); setErr("");
    try { await uploadPetPhoto(petId, file); await load(); }
    catch (ex) { setErr((ex && ex.message) || "Upload failed. Please try again."); }
    setBusy(false);
  }

  async function remove(p) {
    if (busy) return;
    setBusy(true); setErr("");
    try { await deletePetPhoto(p); setConfirmDel(null); setViewing(null); await load(); }
    catch (ex) { setErr((ex && ex.message) || "Couldn't delete this photo."); }
    setBusy(false);
  }

  var list = photos || [];
  return (
    <div style={{ borderBottom: "1px solid " + BORDER, paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: FOREGROUND }}>Photos</div>
        {!unavailable ? (
          <label style={{ background: MUTED, border: "1px solid " + BORDER, borderRadius: 10, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Uploading…" : "Add photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Add photo" disabled={busy} onChange={onPick} style={{ display: "none" }} />
          </label>
        ) : null}
      </div>
      {photos === null ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>Loading photos…</p> : null}
      {unavailable ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>Photos aren't available yet. Ask your administrator to apply migration 111.</p> : null}
      {photos !== null && !unavailable && list.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>No photos yet.</p> : null}
      {list.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
          {list.map(function (p) {
            return p.url ? (
              <button key={p.id} type="button" onClick={function () { setViewing(p); setConfirmDel(null); }} aria-label="View photo"
                style={{ padding: 0, border: "1px solid " + BORDER, borderRadius: 10, overflow: "hidden", background: MUTED, cursor: "pointer", aspectRatio: "1 / 1" }}>
                <img src={p.url} alt="Pet" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ) : (
              <div key={p.id} style={{ border: "1px solid " + BORDER, borderRadius: 10, background: MUTED, aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: MUTED_FG, textAlign: "center", padding: 6 }}>Photo unavailable</div>
            );
          })}
        </div>
      ) : null}
      <ErrorLine>{err}</ErrorLine>
      {viewing ? (
        <Modal open={true} onClose={function () { setViewing(null); setConfirmDel(null); }} title="Photo" width={560}
          footer={<>
            {canDelete ? (confirmDel === viewing.id
              ? <><Button variant="danger" onClick={function () { remove(viewing); }} disabled={busy}>Confirm delete</Button><Button variant="ghost" onClick={function () { setConfirmDel(null); }}>Cancel</Button></>
              : <Button variant="ghost-danger" onClick={function () { setConfirmDel(viewing.id); }}>Delete photo</Button>) : null}
            <Button onClick={function () { setViewing(null); setConfirmDel(null); }}>Close</Button>
          </>}>
          <img src={viewing.url} alt="Pet" style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block", borderRadius: 10 }} />
        </Modal>
      ) : null}
    </div>
  );
}
