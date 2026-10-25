// src/pages/pet/SuppliesPage.jsx
//
// Products & Supplies (Phase 8): retail products (sold on invoices) and
// consumables (used up by grooming and boarding), kept apart. Items and
// suppliers are added and edited here; the QUANTITY is never edited directly.
// Every change goes through a database function that writes the stock ledger
// (receive stock, adjust, use) or happens inside a sale (migration 092), and the
// database refuses to go below zero. Not built: batch/expiry tracking, purchase
// orders, supplier payments, linking usage to a booking from this screen.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import {
  KINDS, KIND_LABELS, UNITS, ADJUST_REASONS, REASON_LABELS, validateItem, itemRow, isDuplicateItem, stockLevel, filterItems,
  categoriesOf, summarizeStock, validateReceipt, receiptLines, receiptTotal, validateAdjustment, validateUse, supplyErrorMessage,
} from "./supplyData";
import { newIdempotencyKey } from "./invoiceData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

var LEVEL_TONE = { ok: "success", low: "warning", out: "danger" };
var LEVEL_LABEL = { ok: "In stock", low: "Low stock", out: "Out of stock" };

function emptyItem() { return { kind: "retail", name: "", sku: "", category: "", unit: "each", price: "", cost: "", reorder_level: "", supplier_id: "", opening: "", active: true }; }
function draftFrom(i) {
  function s(v) { return v === null || v === undefined ? "" : String(v); }
  return { kind: i.kind, name: i.name || "", sku: i.sku || "", category: i.category || "", unit: i.unit || "each", price: s(i.price), cost: s(i.cost),
    reorder_level: s(i.reorder_level), supplier_id: i.supplier_id || "", opening: "", active: i.active !== false };
}
function sortItems(list) { return list.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); }

export default function SuppliesPage({ canEdit }) {
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var statusState = useState("loading"); var loadStatus = statusState[0]; var setLoadStatus = statusState[1];
  var tickState = useState(0); var tick = tickState[0]; var setTick = tickState[1];
  var fState = useState({ q: "", kind: "all", category: "all", lowOnly: false, showInactive: false }); var filters = fState[0]; var setFilters = fState[1];
  var modalState = useState(null); var modal = modalState[0]; var setModal = modalState[1]; // {type, ...}
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var histState = useState({ status: "idle", rows: [] }); var hist = histState[0]; var setHist = histState[1];
  var keyRef = useRef(null);

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    Promise.all([
      db("GET", "pet_items", null, "?select=*&order=name.asc&limit=3000"),
      db("GET", "pet_suppliers", null, "?select=*&order=name.asc&limit=500"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- an error, not "no stock".
      if (!Array.isArray(res[0]) || !Array.isArray(res[1])) { setLoadStatus("error"); return; }
      setData({ items: res[0], suppliers: res[1] }); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [tick]);

  var itemsById = useMemo(function () { var m = {}; if (data) data.items.forEach(function (i) { m[i.id] = i; }); return m; }, [data]);
  var supplierName = useMemo(function () { var m = {}; if (data) data.suppliers.forEach(function (s) { m[s.id] = s.name; }); return m; }, [data]);

  useEffect(function () {
    if (!modal || modal.type !== "history") return;
    var cancelled = false;
    setHist({ status: "loading", rows: [] });
    db("GET", "pet_stock_movements", null, "?select=*&item_id=eq." + modal.item.id + "&order=created_at.desc&limit=100").then(function (res) {
      if (cancelled) return;
      setHist(Array.isArray(res) ? { status: "ready", rows: res } : { status: "error", rows: [] });
    });
    return function () { cancelled = true; };
  }, [modal && modal.type === "history" ? modal.item.id : null]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Products & Supplies" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading stock…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Products & Supplies" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load products and supplies" description="Check your connection and try again."
            action={<Button onClick={function () { setTick(tick + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var items = data.items; var suppliers = data.suppliers;
  var shown = filterItems(items, filters);
  var sum = summarizeStock(items);
  var categories = categoriesOf(items);
  function setF(k, v) { var o = {}; o[k] = v; setFilters(Object.assign({}, filters, o)); }
  function open(m) { setErr(""); setModal(m); }
  function close() { if (!saving) { setModal(null); setErr(""); } }
  function reload() { setTick(tick + 1); }

  // ---- item add / edit ----
  function openItem(item) {
    open({ type: "item", id: item ? item.id : null, draft: item ? draftFrom(item) : emptyItem() });
  }
  function patchModal(p) { setModal(Object.assign({}, modal, { draft: Object.assign({}, modal.draft, p) })); setErr(""); }

  async function saveItem() {
    if (saving) return;
    var d = modal.draft;
    var msg = validateItem(d);
    if (!msg && !modal.id && d.opening !== "" && (isNaN(Number(d.opening)) || Number(d.opening) < 1 || Math.floor(Number(d.opening)) !== Number(d.opening))) msg = "Opening stock must be a whole number of at least 1.";
    if (msg) { setErr(msg); return; }
    var row = itemRow(d);
    var dup = isDuplicateItem(items, row, modal.id);
    if (dup) { setErr(dup === "sku" ? "Another item already uses that SKU." : "There is already a " + KIND_LABELS[row.kind].toLowerCase() + " called " + row.name + "."); return; }
    setSaving(true); setErr("");
    if (!modal.id) {
      var created = await db("POST", "pet_items", row);
      if (!Array.isArray(created) || !created[0]) { setSaving(false); setErr("Couldn't save the item. Check your connection and try again."); return; }
      if (d.opening !== "") {
        var res = await dbRpcAuth("pet_adjust_stock", { p_item_id: created[0].id, p_change: Number(d.opening), p_reason: "opening", p_note: null });
        if (res.error) { setSaving(false); setModal(null); reload(); setErr("The item was saved, but its opening stock wasn't (" + supplyErrorMessage(res.error) + ") Use Adjust to set it."); return; }
      }
    } else {
      var patch = Object.assign({}, row); delete patch.kind; // the kind of an item can't change after it is created
      var ok = await db("PATCH", "pet_items", patch, "?id=eq." + modal.id);
      if (!ok) { setSaving(false); setErr("Couldn't save changes. Check your connection and try again."); return; }
    }
    setSaving(false); setModal(null); reload();
  }

  async function toggleActive(item) {
    if (saving) return;
    setSaving(true); setErr("");
    var ok = await db("PATCH", "pet_items", { active: !item.active }, "?id=eq." + item.id);
    setSaving(false);
    if (!ok) { setErr("Couldn't update " + item.name + ". Try again."); return; }
    setData({ items: items.map(function (i) { return i.id === item.id ? Object.assign({}, i, { active: !item.active }) : i; }), suppliers: suppliers });
  }

  // ---- receive stock ----
  function openReceive() { keyRef.current = newIdempotencyKey(); open({ type: "receive", supplier_id: "", reference: "", note: "", lines: [{ item_id: "", quantity: "", unit_cost: "" }] }); }
  function patchLine(i, p) { setModal(Object.assign({}, modal, { lines: modal.lines.map(function (l, idx) { return idx === i ? Object.assign({}, l, p) : l; }) })); setErr(""); }
  async function saveReceipt() {
    if (saving) return;
    var msg = validateReceipt(modal.lines);
    if (msg) { setErr(msg); return; }
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_receive_stock", { p_idempotency_key: keyRef.current, p_supplier_id: modal.supplier_id || null,
      p_reference: modal.reference || null, p_note: modal.note || null, p_lines: receiptLines(modal.lines) });
    setSaving(false);
    if (res.error) { setErr(supplyErrorMessage(res.error)); return; }
    setModal(null); reload();
  }

  // ---- adjust ----
  async function saveAdjust() {
    if (saving) return;
    var msg = validateAdjustment({ reason: modal.reason, change: modal.change, note: modal.note, current: modal.item.quantity_on_hand });
    if (msg) { setErr(msg); return; }
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_adjust_stock", { p_item_id: modal.item.id, p_change: Number(modal.change), p_reason: modal.reason, p_note: modal.note || null });
    setSaving(false);
    if (res.error) { setErr(supplyErrorMessage(res.error)); return; }
    setModal(null); reload();
  }

  // ---- use consumables ----
  async function saveUse() {
    if (saving) return;
    var msg = validateUse(modal.lines, itemsById);
    if (msg) { setErr(msg); return; }
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_use_supplies", { p_booking_id: null, p_items: receiptLines(modal.lines).map(function (l) { return { item_id: l.item_id, quantity: l.quantity }; }) });
    setSaving(false);
    if (res.error) { setErr(supplyErrorMessage(res.error)); return; }
    setModal(null); reload();
  }

  // ---- suppliers ----
  async function saveSupplier() {
    if (saving) return;
    var d = modal.draft;
    if (!d.name.trim()) { setErr("Supplier name is required."); return; }
    if (suppliers.some(function (s) { return s.id !== d.id && s.name.trim().toLowerCase() === d.name.trim().toLowerCase(); })) { setErr("There is already a supplier with that name."); return; }
    setSaving(true); setErr("");
    var row = { name: d.name.trim(), phone: d.phone.trim() || null, email: d.email.trim() || null, notes: d.notes.trim() || null, active: d.active !== false };
    var ok = d.id ? await db("PATCH", "pet_suppliers", row, "?id=eq." + d.id) : await db("POST", "pet_suppliers", row);
    setSaving(false);
    if (!ok || (!d.id && !(Array.isArray(ok) && ok[0]))) { setErr("Couldn't save the supplier. Check your connection and try again."); return; }
    setModal({ type: "suppliers" }); reload();
  }

  var consumables = items.filter(function (i) { return i.kind === "consumable" && i.active; });
  var activeItems = items.filter(function (i) { return i.active; });
  var draft = modal && modal.draft;

  return (
    <div>
      <PageHeader title="Products & Supplies" subtitle="Retail products for sale and consumables used in grooming and boarding"
        actions={canEdit ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function () { open({ type: "suppliers" }); }}>Suppliers</Button>
          <Button variant="outline" onClick={openReceive}>Receive stock</Button>
          <Button onClick={function () { openItem(null); }}>+ Add item</Button>
        </div> : null} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Card style={{ padding: 14 }}><div style={{ fontSize: 12, color: MUTED_FG }}>Low stock</div><div style={{ fontSize: 20, fontWeight: 800 }}>{sum.low}</div></Card>
        <Card style={{ padding: 14 }}><div style={{ fontSize: 12, color: MUTED_FG }}>Out of stock</div><div style={{ fontSize: 20, fontWeight: 800 }}>{sum.out}</div></Card>
        <Card style={{ padding: 14 }}><div style={{ fontSize: 12, color: MUTED_FG }}>Stock value (at cost)</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(sum.value)}</div></Card>
      </div>

      <Card style={{ padding: 12, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input aria-label="Search items" placeholder="Search name, SKU or category" value={filters.q} onChange={function (e) { setF("q", e.target.value); }}
          style={Object.assign({}, inputStyle, { flex: "1 1 200px", width: "auto" })} />
        <select aria-label="Filter by type" value={filters.kind} onChange={function (e) { setF("kind", e.target.value); }} style={Object.assign({}, inputStyle, { width: 160 })}>
          <option value="all">All types</option>{KINDS.map(function (k) { return <option key={k} value={k}>{KIND_LABELS[k]}</option>; })}
        </select>
        <select aria-label="Filter by category" value={filters.category} onChange={function (e) { setF("category", e.target.value); }} style={Object.assign({}, inputStyle, { width: 160 })}>
          <option value="all">All categories</option>{categories.map(function (c) { return <option key={c} value={c}>{c}</option>; })}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED_FG }}><input type="checkbox" checked={filters.lowOnly} onChange={function (e) { setF("lowOnly", e.target.checked); }} />Low or out of stock</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED_FG }}><input type="checkbox" checked={filters.showInactive} onChange={function (e) { setF("showInactive", e.target.checked); }} />Show inactive</label>
      </Card>
      {!modal ? <ErrorLine>{err}</ErrorLine> : null}

      {items.length === 0 ? (
        <Card><EmptyState title="No products or supplies yet" description={canEdit ? "Add retail products you sell and consumables you use, then receive stock." : "An administrator can add the first items."}
          action={canEdit ? <Button onClick={function () { openItem(null); }}>+ Add item</Button> : null} /></Card>
      ) : shown.length === 0 ? (
        <Card><EmptyState title="No items found" description="Try a different search or filter." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 16 }}>
          {shown.map(function (i) {
            var lvl = stockLevel(i);
            return (
              <Card key={i.id} style={{ overflow: "hidden", opacity: i.active ? 1 : 0.7 }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid " + BORDER, background: MUTED }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{i.name}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{i.kind === "retail" ? fmt(i.price) : ""}</div>
                  </div>
                  <div style={{ color: MUTED_FG, fontSize: 12 }}>{KIND_LABELS[i.kind]}{i.category ? " · " + i.category : ""}{i.sku ? " · " + i.sku : ""}</div>
                </div>
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{i.quantity_on_hand} <span style={{ fontSize: 12, fontWeight: 500, color: MUTED_FG }}>{i.unit}</span></div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
                    <Badge tone={LEVEL_TONE[lvl]}>{LEVEL_LABEL[lvl]}</Badge>{!i.active ? <Badge tone="neutral">Inactive</Badge> : null}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED_FG }}>
                    {i.reorder_level > 0 ? "Reorder at " + i.reorder_level : "No reorder level"}{i.supplier_id && supplierName[i.supplier_id] ? " · " + supplierName[i.supplier_id] : ""}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: "1px solid " + BORDER, gap: 4, flexWrap: "wrap" }}>
                  <Button size="sm" variant="outline" onClick={function () { open({ type: "history", item: i }); }} ariaLabel={"History for " + i.name}>History</Button>
                  {canEdit ? <div style={{ display: "flex", gap: 4 }}>
                    <Button size="sm" variant="outline" onClick={function () { open({ type: "adjust", item: i, reason: i.quantity_on_hand === 0 ? "opening" : "adjustment", change: "", note: "" }); }} ariaLabel={"Adjust " + i.name}>Adjust</Button>
                    <Button size="sm" variant="ghost" onClick={function () { openItem(i); }} ariaLabel={"Edit " + i.name}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={function () { toggleActive(i); }} disabled={saving} ariaLabel={(i.active ? "Deactivate " : "Activate ") + i.name}>{i.active ? "Deactivate" : "Activate"}</Button>
                  </div> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {canEdit && consumables.length > 0 ? (
        <div style={{ marginTop: 16 }}><Button variant="outline" onClick={function () { open({ type: "use", lines: [{ item_id: "", quantity: "" }] }); }}>Record supplies used</Button></div>
      ) : null}

      {/* add / edit item */}
      <Modal open={!!modal && modal.type === "item"} onClose={close} title={modal && modal.id ? "Edit item" : "Add item"}
        description="Stock quantities are changed by receiving, adjusting or selling, never typed in directly."
        footer={<><Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button><Button onClick={saveItem} disabled={saving}>{saving ? "Saving…" : modal && modal.id ? "Save changes" : "Add item"}</Button></>}>
        {draft && modal.type === "item" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Type" htmlFor="it-kind">
                <select id="it-kind" style={inputStyle} value={draft.kind} disabled={!!modal.id} onChange={function (e) { patchModal({ kind: e.target.value }); }}>
                  {KINDS.map(function (k) { return <option key={k} value={k}>{KIND_LABELS[k]}</option>; })}
                </select>
              </Field>
              <Field label="Name" htmlFor="it-name"><input id="it-name" style={inputStyle} value={draft.name} onChange={function (e) { patchModal({ name: e.target.value }); }} /></Field>
              <Field label="SKU (optional)" htmlFor="it-sku"><input id="it-sku" style={inputStyle} value={draft.sku} onChange={function (e) { patchModal({ sku: e.target.value }); }} /></Field>
              <Field label="Category (optional)" htmlFor="it-cat"><input id="it-cat" style={inputStyle} value={draft.category} onChange={function (e) { patchModal({ category: e.target.value }); }} /></Field>
              <Field label="Unit" htmlFor="it-unit">
                <input id="it-unit" list="pet-units" style={inputStyle} value={draft.unit} onChange={function (e) { patchModal({ unit: e.target.value }); }} />
                <datalist id="pet-units">{UNITS.map(function (u) { return <option key={u} value={u} />; })}</datalist>
              </Field>
              <Field label="Reorder level" htmlFor="it-reorder"><input id="it-reorder" inputMode="numeric" style={inputStyle} value={draft.reorder_level} onChange={function (e) { patchModal({ reorder_level: e.target.value }); }} /></Field>
              <Field label={draft.kind === "retail" ? "Selling price (KES)" : "Selling price (not used)"} htmlFor="it-price"><input id="it-price" inputMode="numeric" style={inputStyle} value={draft.price} disabled={draft.kind === "consumable"} onChange={function (e) { patchModal({ price: e.target.value }); }} /></Field>
              <Field label="Cost per unit (KES, optional)" htmlFor="it-cost"><input id="it-cost" inputMode="numeric" style={inputStyle} value={draft.cost} onChange={function (e) { patchModal({ cost: e.target.value }); }} /></Field>
            </div>
            <Field label="Supplier (optional)" htmlFor="it-supplier">
              <select id="it-supplier" style={inputStyle} value={draft.supplier_id} onChange={function (e) { patchModal({ supplier_id: e.target.value }); }}>
                <option value="">No supplier</option>{suppliers.filter(function (s) { return s.active || s.id === draft.supplier_id; }).map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
              </select>
            </Field>
            {!modal.id ? <Field label="Opening stock (optional)" htmlFor="it-opening"><input id="it-opening" inputMode="numeric" style={inputStyle} value={draft.opening} onChange={function (e) { patchModal({ opening: e.target.value }); }} /></Field> : null}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}><input type="checkbox" checked={draft.active} onChange={function (e) { patchModal({ active: e.target.checked }); }} />Active</label>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      {/* receive stock */}
      <Modal open={!!modal && modal.type === "receive"} onClose={close} title="Receive stock" width={640}
        description="Record a delivery from a supplier. Quantities are added to stock and the cost is updated when given."
        footer={<><Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button><Button onClick={saveReceipt} disabled={saving}>{saving ? "Saving…" : "Receive stock"}</Button></>}>
        {modal && modal.type === "receive" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Supplier (optional)" htmlFor="rc-supplier">
                <select id="rc-supplier" style={inputStyle} value={modal.supplier_id} onChange={function (e) { setModal(Object.assign({}, modal, { supplier_id: e.target.value })); }}>
                  <option value="">No supplier</option>{suppliers.filter(function (s) { return s.active; }).map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                </select>
              </Field>
              <Field label="Delivery note / reference" htmlFor="rc-ref"><input id="rc-ref" style={inputStyle} value={modal.reference} onChange={function (e) { setModal(Object.assign({}, modal, { reference: e.target.value })); }} /></Field>
            </div>
            {modal.lines.map(function (l, i) {
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px auto", gap: 6, alignItems: "center" }}>
                  <select aria-label={"Item " + (i + 1)} style={inputStyle} value={l.item_id} onChange={function (e) { patchLine(i, { item_id: e.target.value }); }}>
                    <option value="">Choose an item</option>{activeItems.map(function (it) { return <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>; })}
                  </select>
                  <input aria-label={"Quantity " + (i + 1)} placeholder="Qty" inputMode="numeric" style={inputStyle} value={l.quantity} onChange={function (e) { patchLine(i, { quantity: e.target.value }); }} />
                  <input aria-label={"Unit cost " + (i + 1)} placeholder="Unit cost" inputMode="numeric" style={inputStyle} value={l.unit_cost} onChange={function (e) { patchLine(i, { unit_cost: e.target.value }); }} />
                  {modal.lines.length > 1 ? <Button size="sm" variant="ghost" ariaLabel={"Remove line " + (i + 1)} onClick={function () { setModal(Object.assign({}, modal, { lines: modal.lines.filter(function (_, idx) { return idx !== i; }) })); }}>✕</Button> : <span />}
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button size="sm" variant="outline" onClick={function () { setModal(Object.assign({}, modal, { lines: modal.lines.concat([{ item_id: "", quantity: "", unit_cost: "" }]) })); }}>+ Add line</Button>
              <span style={{ fontSize: 13, color: MUTED_FG }}>Total cost: <strong style={{ color: FOREGROUND }}>{fmt(receiptTotal(modal.lines))}</strong></span>
            </div>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      {/* adjust */}
      <Modal open={!!modal && modal.type === "adjust"} onClose={close} title={modal && modal.item ? "Adjust " + modal.item.name : ""}
        description={modal && modal.item ? "Currently " + modal.item.quantity_on_hand + " " + modal.item.unit + ". Use a negative number to reduce stock." : ""}
        footer={<><Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button><Button onClick={saveAdjust} disabled={saving}>{saving ? "Saving…" : "Save adjustment"}</Button></>}>
        {modal && modal.type === "adjust" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Reason" htmlFor="ad-reason">
              <select id="ad-reason" style={inputStyle} value={modal.reason} onChange={function (e) { setModal(Object.assign({}, modal, { reason: e.target.value })); setErr(""); }}>
                {ADJUST_REASONS.map(function (r) { return <option key={r} value={r}>{REASON_LABELS[r]}</option>; })}
              </select>
            </Field>
            <Field label="Change (e.g. 5 or -2)" htmlFor="ad-change"><input id="ad-change" inputMode="numeric" style={inputStyle} value={modal.change} onChange={function (e) { setModal(Object.assign({}, modal, { change: e.target.value })); setErr(""); }} /></Field>
            <Field label={modal.reason === "adjustment" ? "Note (required)" : "Note (optional)"} htmlFor="ad-note"><input id="ad-note" style={inputStyle} value={modal.note} onChange={function (e) { setModal(Object.assign({}, modal, { note: e.target.value })); setErr(""); }} /></Field>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      {/* use consumables */}
      <Modal open={!!modal && modal.type === "use"} onClose={close} title="Record supplies used" description="Take consumables out of stock after grooming or boarding."
        footer={<><Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button><Button onClick={saveUse} disabled={saving}>{saving ? "Saving…" : "Record usage"}</Button></>}>
        {modal && modal.type === "use" ? (
          <div style={{ display: "grid", gap: 10 }}>
            {modal.lines.map(function (l, i) {
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 6 }}>
                  <select aria-label={"Consumable " + (i + 1)} style={inputStyle} value={l.item_id} onChange={function (e) { patchLine(i, { item_id: e.target.value }); }}>
                    <option value="">Choose a consumable</option>{consumables.map(function (it) { return <option key={it.id} value={it.id}>{it.name} ({it.quantity_on_hand} {it.unit})</option>; })}
                  </select>
                  <input aria-label={"Amount used " + (i + 1)} placeholder="Amount" inputMode="numeric" style={inputStyle} value={l.quantity} onChange={function (e) { patchLine(i, { quantity: e.target.value }); }} />
                  {modal.lines.length > 1 ? <Button size="sm" variant="ghost" ariaLabel={"Remove usage line " + (i + 1)} onClick={function () { setModal(Object.assign({}, modal, { lines: modal.lines.filter(function (_, idx) { return idx !== i; }) })); }}>✕</Button> : <span />}
                </div>
              );
            })}
            <div><Button size="sm" variant="outline" onClick={function () { setModal(Object.assign({}, modal, { lines: modal.lines.concat([{ item_id: "", quantity: "" }]) })); }}>+ Add line</Button></div>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      {/* history */}
      <Modal open={!!modal && modal.type === "history"} onClose={close} title={modal && modal.item ? modal.item.name + ": stock history" : ""} width={600}
        footer={<Button variant="ghost" onClick={close}>Close</Button>}>
        {modal && modal.type === "history" ? (
          hist.status === "loading" ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>Loading history…</p>
          : hist.status === "error" ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>Couldn't load the history. Close and try again.</p>
          : hist.rows.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>No stock movements yet.</p>
          : <div>{hist.rows.map(function (m) {
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "6px 0", borderBottom: "1px solid " + BORDER }}>
                <span>{new Date(m.created_at).toLocaleDateString()} · {REASON_LABELS[m.reason] || m.reason}{m.note ? " · " + m.note : ""}</span>
                <span><strong>{m.change_qty > 0 ? "+" + m.change_qty : m.change_qty}</strong> <span style={{ color: MUTED_FG }}>→ {m.quantity_after}</span></span>
              </div>
            );
          })}</div>
        ) : null}
      </Modal>

      {/* suppliers */}
      <Modal open={!!modal && (modal.type === "suppliers" || modal.type === "supplier")} onClose={close} title={modal && modal.type === "supplier" ? (modal.draft.id ? "Edit supplier" : "Add supplier") : "Suppliers"}
        footer={modal && modal.type === "supplier"
          ? <><Button variant="ghost" onClick={function () { setModal({ type: "suppliers" }); setErr(""); }} disabled={saving}>Back</Button><Button onClick={saveSupplier} disabled={saving}>{saving ? "Saving…" : "Save supplier"}</Button></>
          : <><Button variant="ghost" onClick={close}>Close</Button><Button onClick={function () { open({ type: "supplier", draft: { name: "", phone: "", email: "", notes: "", active: true } }); }}>+ Add supplier</Button></>}>
        {modal && modal.type === "suppliers" ? (
          suppliers.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>No suppliers yet.</p>
          : suppliers.map(function (s) {
            return (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid " + BORDER }}>
                <div><div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}{!s.active ? " (inactive)" : ""}</div><div style={{ fontSize: 12, color: MUTED_FG }}>{[s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}</div></div>
                <Button size="sm" variant="ghost" ariaLabel={"Edit supplier " + s.name} onClick={function () { open({ type: "supplier", draft: { id: s.id, name: s.name, phone: s.phone || "", email: s.email || "", notes: s.notes || "", active: s.active } }); }}>Edit</Button>
              </div>
            );
          })
        ) : modal && modal.type === "supplier" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Supplier name" htmlFor="sp-name"><input id="sp-name" style={inputStyle} value={modal.draft.name} onChange={function (e) { patchModal({ name: e.target.value }); }} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Phone (optional)" htmlFor="sp-phone"><input id="sp-phone" inputMode="tel" style={inputStyle} value={modal.draft.phone} onChange={function (e) { patchModal({ phone: e.target.value }); }} /></Field>
              <Field label="Email (optional)" htmlFor="sp-email"><input id="sp-email" style={inputStyle} value={modal.draft.email} onChange={function (e) { patchModal({ email: e.target.value }); }} /></Field>
            </div>
            <Field label="Notes (optional)" htmlFor="sp-notes"><input id="sp-notes" style={inputStyle} value={modal.draft.notes} onChange={function (e) { patchModal({ notes: e.target.value }); }} /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}><input type="checkbox" checked={modal.draft.active} onChange={function (e) { patchModal({ active: e.target.checked }); }} />Active</label>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
