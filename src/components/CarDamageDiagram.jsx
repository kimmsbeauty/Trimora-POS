import { useState } from "react";
import { INK, CHROME, SIGNAL, ALERT, PAPER } from "../pages/auto/theme";

// A tap-to-mark, top-down car outline for recording existing damage.
// Deliberately NOT a photo overlay or a full body-panel model -- a
// simple silhouette is enough to communicate "roughly where", and
// avoids needing per-make/model artwork this codebase doesn't have.
//
// markers: [{ id, x, y, type, note }], x/y normalized 0-1 against the
// SVG's own viewBox, so they don't drift if the diagram is resized.
// referenceMarkers: same shape, rendered faded UNDER the live layer --
// used at pickup to show what was already marked at check-in, so new
// damage is visually obvious by comparison. This is a visual aid only;
// no automatic new-vs-old diffing happens (deliberately out of scope,
// flagged when this was proposed).

var MARKER_TYPES = [
  { id: "scratch", label: "Scratch", color: "#F5C542" },
  { id: "dent", label: "Dent", color: "#F5844C" },
  { id: "paint_chip", label: "Paint chip", color: "#4CA6F5" },
  { id: "crack", label: "Crack", color: ALERT },
  { id: "other", label: "Other", color: CHROME },
];

function typeColor(typeId) {
  var match = MARKER_TYPES.filter(function (t) { return t.id === typeId; })[0];
  return match ? match.color : CHROME;
}

function CarSilhouette() {
  // Top-down outline: a rounded body, a windshield band front and
  // rear, and four wheel marks -- enough visual landmarks that "front
  // bumper" vs "rear door" is unambiguous when a marker is dropped.
  return (
    <g>
      <rect x="60" y="20" width="180" height="460" rx="50" fill="none" stroke={CHROME} strokeWidth="2" />
      <rect x="80" y="70" width="140" height="60" rx="8" fill="none" stroke={CHROME} strokeWidth="1.5" opacity="0.6" />
      <rect x="80" y="370" width="140" height="60" rx="8" fill="none" stroke={CHROME} strokeWidth="1.5" opacity="0.6" />
      <rect x="45" y="90" width="18" height="70" rx="6" fill={CHROME} opacity="0.4" />
      <rect x="237" y="90" width="18" height="70" rx="6" fill={CHROME} opacity="0.4" />
      <rect x="45" y="340" width="18" height="70" rx="6" fill={CHROME} opacity="0.4" />
      <rect x="237" y="340" width="18" height="70" rx="6" fill={CHROME} opacity="0.4" />
      <text x="150" y="45" textAnchor="middle" fontSize="11" fill={CHROME} opacity="0.7">FRONT</text>
      <text x="150" y="465" textAnchor="middle" fontSize="11" fill={CHROME} opacity="0.7">REAR</text>
    </g>
  );
}

export default function CarDamageDiagram(props) {
  var markers = props.markers || [];
  var referenceMarkers = props.referenceMarkers || [];
  var onChange = props.onChange || function () {};
  var readOnly = !!props.readOnly;

  var selectedIdState = useState(null);
  var selectedId = selectedIdState[0]; var setSelectedId = selectedIdState[1];

  var selected = markers.filter(function (m) { return m.id === selectedId; })[0] || null;

  function handleDiagramClick(e) {
    if (readOnly) return;
    var svg = e.currentTarget;
    var rect = svg.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width;
    var y = (e.clientY - rect.top) / rect.height;
    var id = "m" + Date.now() + Math.floor(Math.random() * 1000);
    var next = markers.concat([{ id: id, x: x, y: y, type: "scratch", note: "" }]);
    onChange(next);
    setSelectedId(id);
  }

  function updateSelected(patch) {
    if (!selected) return;
    onChange(markers.map(function (m) { return m.id === selected.id ? Object.assign({}, m, patch) : m; }));
  }

  function removeSelected() {
    if (!selected) return;
    onChange(markers.filter(function (m) { return m.id !== selected.id; }));
    setSelectedId(null);
  }

  return (
    <div>
      <svg viewBox="0 0 300 500" onClick={handleDiagramClick}
        style={{ width: "100%", maxWidth: 220, display: "block", margin: "0 auto", cursor: readOnly ? "default" : "crosshair", background: "rgba(255,255,255,0.02)", borderRadius: 12 }}>
        <CarSilhouette />
        {referenceMarkers.map(function (m) {
          return <circle key={"ref-" + m.id} cx={m.x * 300} cy={m.y * 500} r="7" fill={typeColor(m.type)} opacity="0.28" />;
        })}
        {markers.map(function (m) {
          var isSelected = m.id === selectedId;
          return (
            <circle key={m.id} cx={m.x * 300} cy={m.y * 500} r={isSelected ? 9 : 7}
              fill={typeColor(m.type)} stroke={isSelected ? PAPER : "none"} strokeWidth="2"
              onClick={function (e) { e.stopPropagation(); if (!readOnly) setSelectedId(m.id); }}
              style={{ cursor: readOnly ? "default" : "pointer" }} />
          );
        })}
      </svg>

      {!readOnly && (
        <div style={{ fontSize: 10, color: CHROME, textAlign: "center", marginTop: 6 }}>
          Tap the diagram to mark damage. Tap an existing dot to edit it.
        </div>
      )}

      {!readOnly && selected && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid " + CHROME + "33", background: "rgba(255,255,255,0.03)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {MARKER_TYPES.map(function (t) {
              var active = selected.type === t.id;
              return (
                <span key={t.id} onClick={function () { updateSelected({ type: t.id }); }}
                  style={{
                    fontSize: 10, fontWeight: 700, padding: "5px 9px", borderRadius: 6, cursor: "pointer",
                    background: active ? t.color : "transparent", color: active ? INK : t.color,
                    border: "1.5px solid " + t.color,
                  }}>
                  {t.label}
                </span>
              );
            })}
          </div>
          <input value={selected.note || ""} onChange={function (e) { updateSelected({ note: e.target.value }); }}
            placeholder="Note (optional)"
            style={{
              width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", color: PAPER,
              border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "6px 8px", fontSize: 11, marginBottom: 8,
            }} />
          <span onClick={removeSelected} style={{ fontSize: 10, color: ALERT, textDecoration: "underline", cursor: "pointer" }}>
            Remove marker
          </span>
        </div>
      )}

      {markers.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" }}>
          {markers.map(function (m) {
            var t = MARKER_TYPES.filter(function (x) { return x.id === m.type; })[0];
            return (
              <span key={m.id} style={{ fontSize: 9, color: CHROME, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: typeColor(m.type), display: "inline-block" }} />
                {(t ? t.label : m.type)}{m.note ? ": " + m.note : ""}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
