// src/pages/pet/LoyaltyPage.jsx
//
// Loyalty Programme (Phase 9): members and their points, rewards, vouchers and the
// earning rules, over migration 101. The client only READS the loyalty tables (and
// adds/edits rewards); every other change goes through the pet_* database functions.
// Points are awarded by the database when an invoice is paid or a booking is
// completed, never by this screen.
//
// The programme starts OFF. A voucher is applied at checkout by staff using the
// existing discount, then marked used here. Not built yet: automatic voucher use at
// checkout, referral bonus, points expiry, reversing points on refunds, points on the
// receipt. Rules / reward editing is admin-only navigation behaviour (a UI convenience:
// the shared device session means the database cannot yet tell staff from admin).
import React, { useEffect, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND, PRIMARY } from "./theme";
import {
  TIER_TONES, REASON_LABELS, VOUCHER_LABELS, VOUCHER_TONES, DEFAULT_SETTINGS, withDefaults, tierFor, tierProgress, pointsFor,
  parseInts, validateSettings, validateReward, isDuplicateReward, validateAdjustment, accountOf, memberRows, summary, loyaltyErrorMessage,
} from "./loyaltyData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

var TABS = [["members", "Members"], ["rewards", "Rewards"], ["vouchers", "Vouchers"], ["rules", "Rules"]];

async function fetchAll() {
  var res = await Promise.all([
    db("GET", "pet_loyalty_settings", null, "?select=*&limit=1"),
    db("GET", "pet_loyalty_rewards", null, "?select=*&order=points_cost.asc&limit=500"),
    db("GET", "pet_loyalty_accounts", null, "?select=*&order=points_balance.desc&limit=5000"),
    db("GET", "pet_loyalty_redemptions", null, "?select=*&order=issued_at.desc&limit=500"),
    db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=5000"),
  ]);
  // db() returns null when a request failed -- an error, not "no data".
  for (var i = 0; i < res.length; i++) if (!Array.isArray(res[i])) return null;
  return { settings: res[0][0] || null, rewards: res[1], accounts: res[2], redemptions: res[3], customers: res[4] };
}
function draftOf(settings) {
  var s = withDefaults(settings);
  return { enabled: s.enabled, kes_per_point: String(s.kes_per_point), visit_bonus: String(s.visit_bonus), silver_at: String(s.silver_at), gold_at: String(s.gold_at) };
}
function when(iso) { try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }

export default function LoyaltyPage({ canEdit }) {
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var loadState = useState("loading"); var loadStatus = loadState[0]; var setLoadStatus = loadState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];
  var tabState = useState("members"); var tab = tabState[0]; var setTab = tabState[1];
  var queryState = useState(""); var query = queryState[0]; var setQuery = queryState[1];
  var memberState = useState(null); var member = memberState[0]; var setMember = memberState[1]; // customer id
  var ledgerState = useState({ status: "idle", rows: [] }); var ledger = ledgerState[0]; var setLedger = ledgerState[1];
  var pickState = useState(""); var pickReward = pickState[0]; var setPickReward = pickState[1];
  var adjState = useState({ points: "", note: "" }); var adj = adjState[0]; var setAdj = adjState[1];
  var rewardFormState = useState(null); var rewardForm = rewardFormState[0]; var setRewardForm = rewardFormState[1];
  var confirmState = useState(null); var confirm = confirmState[0]; var setConfirm = confirmState[1];
  var ruleState = useState(draftOf(null)); var rules = ruleState[0]; var setRules = ruleState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var noticeState = useState(""); var notice = noticeState[0]; var setNotice = noticeState[1];

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    fetchAll().then(function (d) {
      if (cancelled) return;
      if (!d) { setLoadStatus("error"); return; }
      setData(d); setRules(draftOf(d.settings)); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [attempt]);

  useEffect(function () {
    if (!member) { setLedger({ status: "idle", rows: [] }); return undefined; }
    var cancelled = false;
    setLedger({ status: "loading", rows: [] });
    db("GET", "pet_loyalty_ledger", null, "?select=*&customer_id=eq." + member + "&order=created_at.desc&limit=50").then(function (rows) {
      if (cancelled) return;
      setLedger(Array.isArray(rows) ? { status: "ready", rows: rows } : { status: "error", rows: [] });
    });
    return function () { cancelled = true; };
  }, [member, data]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Loyalty Programme" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading loyalty data…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Loyalty Programme" />
        <Card style={{ padding: 8 }}><EmptyState title="Couldn't load loyalty" description="Check your connection and try again."
          action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} /></Card>
      </div>
    );
  }

  var settings = withDefaults(data.settings);
  var customersById = {}; data.customers.forEach(function (c) { customersById[c.id] = c; });
  var rows = memberRows(data.customers, data.accounts, settings, query);
  var sum = summary(data.accounts, data.redemptions);
  var activeRewards = data.rewards.filter(function (r) { return r.active; });
  var nameOf = function (id) { return customersById[id] ? customersById[id].name : "Unknown customer"; };

  async function reload() { var d = await fetchAll(); if (d) { setData(d); setRules(draftOf(d.settings)); } }
  // Runs a database function; on success reloads, on failure shows the friendly reason.
  async function run(fn, args) {
    if (busy) return false;
    setBusy(true); setErr(""); setNotice("");
    var res = await dbRpcAuth(fn, args);
    if (res && res.error) { setBusy(false); setErr(loyaltyErrorMessage(res.error)); return false; }
    await reload(); setBusy(false);
    return true;
  }

  // ---- member panel ----
  var memberCustomer = member ? (customersById[member] || { id: member, name: "Unknown customer", phone: "" }) : null;
  var memberAcc = member ? accountOf(data.accounts, member) : null;
  var balance = memberAcc ? memberAcc.points_balance : 0;
  var lifetime = memberAcc ? memberAcc.lifetime_earned : 0;
  var progress = tierProgress(lifetime, settings);
  function openMember(id) { setErr(""); setNotice(""); setPickReward(""); setAdj({ points: "", note: "" }); setMember(id); }
  function closeMember() { if (!busy) { setMember(null); setErr(""); } }
  async function redeem() {
    if (!pickReward) { setErr("Choose a reward."); return; }
    var ok = await run("pet_redeem_reward", { p_customer_id: member, p_reward_id: pickReward });
    if (ok) { setPickReward(""); setNotice("Reward redeemed. Apply it at checkout, then mark the voucher used under Vouchers."); }
  }
  async function adjust() {
    var msg = validateAdjustment(adj.points, adj.note, balance);
    if (msg) { setErr(msg); return; }
    var ok = await run("pet_adjust_loyalty", { p_customer_id: member, p_points: Number(adj.points), p_note: adj.note.trim() });
    if (ok) setAdj({ points: "", note: "" });
  }

  // ---- rewards ----
  function openReward(r) { setErr(""); setRewardForm({ id: r ? r.id : null, draft: { name: r ? r.name : "", points_cost: r ? String(r.points_cost) : "", active: r ? r.active : true } }); }
  function closeReward() { if (!busy) { setRewardForm(null); setErr(""); } }
  function setRewardField(k, v) { var d = Object.assign({}, rewardForm.draft); d[k] = v; setRewardForm(Object.assign({}, rewardForm, { draft: d })); }
  async function saveReward() {
    var d = rewardForm.draft; var msg = validateReward(d);
    if (msg) { setErr(msg); return; }
    if (isDuplicateReward(data.rewards, d.name, rewardForm.id)) { setErr("You already have a reward with that name."); return; }
    setBusy(true); setErr("");
    var body = { name: d.name.trim(), points_cost: Number(d.points_cost), active: !!d.active };
    var res = rewardForm.id ? await db("PATCH", "pet_loyalty_rewards", body, "?id=eq." + rewardForm.id) : await db("POST", "pet_loyalty_rewards", body);
    var ok = rewardForm.id ? !!res : Array.isArray(res) && !!res[0];
    if (!ok) { setBusy(false); setErr("Couldn't save the reward. Check your connection and try again."); return; }
    await reload(); setBusy(false); setRewardForm(null);
  }
  async function toggleReward(r) {
    if (busy) return;
    setBusy(true); setErr("");
    var res = await db("PATCH", "pet_loyalty_rewards", { active: !r.active }, "?id=eq." + r.id);
    if (!res) { setBusy(false); setErr("Couldn't update the reward. Try again."); return; }
    await reload(); setBusy(false);
  }

  // ---- vouchers ----
  async function resolveVoucher() {
    var ok = await run("pet_set_redemption_status", { p_id: confirm.voucher.id, p_status: confirm.kind === "use" ? "used" : "cancelled" });
    if (ok) setConfirm(null);
  }

  // ---- rules ----
  function setRuleField(k, v) { var d = Object.assign({}, rules); d[k] = v; setRules(d); setNotice(""); }
  async function saveRules() {
    var msg = validateSettings(rules);
    if (msg) { setErr(msg); return; }
    var s = parseInts(rules);
    var ok = await run("pet_save_loyalty_settings", { p_enabled: s.enabled, p_kes_per_point: s.kes_per_point, p_visit_bonus: s.visit_bonus, p_silver_at: s.silver_at, p_gold_at: s.gold_at });
    if (ok) setNotice("Rules saved.");
  }
  var previewSettings = validateSettings(rules) === "" ? parseInts(rules) : settings;

  var vouchers = data.redemptions;
  return (
    <div>
      <PageHeader title="Loyalty Programme" subtitle="Points customers earn, tiers and rewards they can redeem." />
      {!settings.enabled ? (
        <Card style={{ padding: "10px 14px", marginBottom: 16, background: MUTED, fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>
          <strong>The programme is off.</strong> No points are being earned yet. {canEdit ? "Turn it on under Rules." : "An administrator can turn it on under Rules."} Invoices and visits from before it is switched on are not back-filled.
        </Card>
      ) : null}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map(function (t) {
          return <Button key={t[0]} size="sm" variant={tab === t[0] ? undefined : "outline"} ariaLabel={"Tab: " + t[1]} onClick={function () { setTab(t[0]); setErr(""); setNotice(""); }}>
            {t[1]}{t[0] === "vouchers" && sum.vouchersReady > 0 ? " (" + sum.vouchersReady + ")" : ""}</Button>;
        })}
      </div>
      {!member && !rewardForm && !confirm && tab !== "rules" ? <ErrorLine>{err}</ErrorLine> : null}
      {!member && tab !== "rules" && notice ? <p style={{ margin: "0 0 12px", fontSize: 13, color: MUTED_FG }}>{notice}</p> : null}

      {tab === "members" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
            {[["Members", sum.members], ["Points outstanding", sum.outstanding], ["Points earned, all time", sum.earned], ["Points redeemed", sum.redeemed]].map(function (s) {
              return <Card key={s[0]} style={{ padding: "12px 16px" }}><div style={{ fontSize: 22, fontWeight: 700 }}>{s[1].toLocaleString()}</div><div style={{ fontSize: 12, color: MUTED_FG }}>{s[0]}</div></Card>;
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input aria-label="Search members" style={Object.assign({}, inputStyle, { maxWidth: 260 })} placeholder="Search members…" value={query} onChange={function (e) { setQuery(e.target.value); }} />
            <select aria-label="Open a customer" style={Object.assign({}, inputStyle, { maxWidth: 260 })} value="" onChange={function (e) { if (e.target.value) openMember(e.target.value); }}>
              <option value="">Open any customer…</option>
              {data.customers.map(function (c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
            </select>
          </div>
          {rows.length === 0 ? (
            <Card><EmptyState title={query ? "No matching members" : "No members yet"}
              description={query ? "Try a different name or phone number." : "Customers join automatically when they earn their first points, once the programme is on."} /></Card>
          ) : (
            <Card>
              {rows.map(function (m, i) {
                return (
                  <div key={m.customer.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid " + BORDER }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{m.customer.name}</div>
                      <div style={{ color: MUTED_FG, fontSize: 12 }}>{m.account.lifetime_earned.toLocaleString()} earned · {m.account.lifetime_redeemed.toLocaleString()} redeemed</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Badge tone={TIER_TONES[m.tier]}>{m.tier}</Badge>
                      <strong style={{ fontSize: 14, minWidth: 64, textAlign: "right" }}>{m.account.points_balance.toLocaleString()} pts</strong>
                      <Button size="sm" variant="outline" ariaLabel={"Open " + m.customer.name} onClick={function () { openMember(m.customer.id); }}>Open</Button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      ) : null}

      {tab === "rewards" ? (
        <div>
          {canEdit ? <div style={{ marginBottom: 12 }}><Button onClick={function () { openReward(null); }}>+ Add reward</Button></div> : null}
          {data.rewards.length === 0 ? (
            <Card><EmptyState title="No rewards yet" description={canEdit ? "Add things customers can spend points on, like a free nail trim." : "An administrator can add rewards."} /></Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {data.rewards.map(function (r) {
                return (
                  <Card key={r.id} style={{ padding: 16, opacity: r.active ? 1 : 0.6 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                    <div style={{ color: MUTED_FG, fontSize: 13, margin: "4px 0 10px" }}>{r.points_cost.toLocaleString()} points</div>
                    <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "Available" : "Switched off"}</Badge>
                    {canEdit ? (
                      <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                        <Button size="sm" variant="ghost" ariaLabel={"Edit " + r.name} onClick={function () { openReward(r); }}>Edit</Button>
                        <Button size="sm" variant="ghost" ariaLabel={(r.active ? "Switch off " : "Switch on ") + r.name} disabled={busy} onClick={function () { toggleReward(r); }}>{r.active ? "Switch off" : "Switch on"}</Button>
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === "vouchers" ? (
        vouchers.length === 0 ? <Card><EmptyState title="No vouchers yet" description="When a customer redeems a reward, a voucher appears here to apply at checkout." /></Card> : (
          <Card>
            {vouchers.map(function (v, i) {
              return (
                <div key={v.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid " + BORDER }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{v.reward_name} <span style={{ fontWeight: 400, color: MUTED_FG }}>· {nameOf(v.customer_id)}</span></div>
                    <div style={{ color: MUTED_FG, fontSize: 12 }}>{v.points_cost.toLocaleString()} points · issued {when(v.issued_at)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge tone={VOUCHER_TONES[v.status]}>{VOUCHER_LABELS[v.status]}</Badge>
                    {v.status === "issued" ? <Button size="sm" variant="outline" ariaLabel={"Mark " + v.reward_name + " used for " + nameOf(v.customer_id)} onClick={function () { setErr(""); setConfirm({ kind: "use", voucher: v }); }}>Mark used</Button> : null}
                    {v.status === "issued" ? <Button size="sm" variant="ghost-danger" ariaLabel={"Cancel " + v.reward_name + " for " + nameOf(v.customer_id)} onClick={function () { setErr(""); setConfirm({ kind: "cancel", voucher: v }); }}>Cancel</Button> : null}
                  </div>
                </div>
              );
            })}
          </Card>
        )
      ) : null}

      {tab === "rules" ? (
        <Card style={{ padding: 16, maxWidth: 520 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" disabled={!canEdit} checked={rules.enabled} onChange={function (e) { setRuleField("enabled", e.target.checked); }} />
              Loyalty programme is on
            </label>
            <Field label="Spend (KES) per point" htmlFor="rule-kes"><input id="rule-kes" disabled={!canEdit} inputMode="numeric" style={inputStyle} value={rules.kes_per_point} onChange={function (e) { setRuleField("kes_per_point", e.target.value); }} /></Field>
            <Field label="Visit bonus (points per completed appointment, 0 for none)" htmlFor="rule-visit"><input id="rule-visit" disabled={!canEdit} inputMode="numeric" style={inputStyle} value={rules.visit_bonus} onChange={function (e) { setRuleField("visit_bonus", e.target.value); }} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Silver from (lifetime points)" htmlFor="rule-silver"><input id="rule-silver" disabled={!canEdit} inputMode="numeric" style={inputStyle} value={rules.silver_at} onChange={function (e) { setRuleField("silver_at", e.target.value); }} /></Field>
              <Field label="Gold from (lifetime points)" htmlFor="rule-gold"><input id="rule-gold" disabled={!canEdit} inputMode="numeric" style={inputStyle} value={rules.gold_at} onChange={function (e) { setRuleField("gold_at", e.target.value); }} /></Field>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>
              Example: an invoice of {fmt(1500)} earns {pointsFor(1500, previewSettings)} points when it is paid. Tiers use lifetime points earned, so spending points never lowers a tier.
              Defaults if you change nothing: 1 point per KES {DEFAULT_SETTINGS.kes_per_point}, Silver at {DEFAULT_SETTINGS.silver_at}, Gold at {DEFAULT_SETTINGS.gold_at}.
            </p>
            <ErrorLine>{err}</ErrorLine>
            {notice ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>{notice}</p> : null}
            {canEdit ? <div><Button onClick={saveRules} disabled={busy}>{busy ? "Saving…" : "Save rules"}</Button></div> : <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>Only an administrator can change the rules.</p>}
          </div>
        </Card>
      ) : null}

      <Modal open={!!member} onClose={closeMember} title={memberCustomer ? memberCustomer.name : ""}
        description={memberCustomer && memberCustomer.phone ? memberCustomer.phone : undefined}
        footer={<Button variant="ghost" onClick={closeMember} disabled={busy}>Close</Button>}>
        {memberCustomer ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{balance.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 400, color: MUTED_FG }}>points</span></div>
              <Badge tone={TIER_TONES[tierFor(lifetime, settings)]}>{tierFor(lifetime, settings)}</Badge>
            </div>
            {progress ? (
              <div>
                <div style={{ height: 6, borderRadius: 4, background: MUTED }}><div style={{ width: progress.pct + "%", height: 6, borderRadius: 4, background: PRIMARY }} /></div>
                <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 4 }}>{progress.pointsNeeded.toLocaleString()} more points earned to reach {progress.next}</div>
              </div>
            ) : <div style={{ fontSize: 12, color: MUTED_FG }}>Top tier reached.</div>}

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>REDEEM A REWARD</div>
              <div style={{ display: "flex", gap: 8 }}>
                <select aria-label="Reward" style={inputStyle} value={pickReward} onChange={function (e) { setPickReward(e.target.value); setErr(""); }}>
                  <option value="">Choose a reward…</option>
                  {activeRewards.map(function (r) { return <option key={r.id} value={r.id} disabled={r.points_cost > balance}>{r.name} ({r.points_cost.toLocaleString()} pts){r.points_cost > balance ? " – not enough points" : ""}</option>; })}
                </select>
                <Button onClick={redeem} disabled={busy || !settings.enabled}>Redeem</Button>
              </div>
              {!settings.enabled ? <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 4 }}>Switch the programme on under Rules to redeem.</div> : null}
            </div>

            {canEdit ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>ADJUST POINTS</div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 8 }}>
                  <input aria-label="Points to add or remove" inputMode="numeric" style={inputStyle} placeholder="+100 / -50" value={adj.points} onChange={function (e) { setAdj({ points: e.target.value, note: adj.note }); }} />
                  <input aria-label="Reason for adjustment" style={inputStyle} placeholder="Reason (required)" value={adj.note} onChange={function (e) { setAdj({ points: adj.points, note: e.target.value }); }} />
                  <Button variant="outline" onClick={adjust} disabled={busy}>Apply</Button>
                </div>
              </div>
            ) : null}

            <ErrorLine>{err}</ErrorLine>
            {notice ? <p style={{ margin: 0, fontSize: 13, color: MUTED_FG }}>{notice}</p> : null}

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>HISTORY</div>
              {ledger.status === "loading" ? <div style={{ fontSize: 12, color: MUTED_FG }}>Loading history…</div>
                : ledger.status === "error" ? <div style={{ fontSize: 12, color: MUTED_FG }}>Couldn't load history.</div>
                : ledger.rows.length === 0 ? <div style={{ fontSize: 12, color: MUTED_FG }}>No activity yet.</div>
                : ledger.rows.map(function (l) {
                  return (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "5px 0", borderTop: "1px solid " + BORDER }}>
                      <span>{REASON_LABELS[l.reason] || l.reason}{l.note ? " · " + l.note : ""} <span style={{ color: MUTED_FG }}>· {when(l.created_at)}</span></span>
                      <strong style={{ color: l.points > 0 ? FOREGROUND : MUTED_FG }}>{l.points > 0 ? "+" : ""}{l.points.toLocaleString()}</strong>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!rewardForm} onClose={closeReward} title={rewardForm && rewardForm.id ? "Edit reward" : "Add reward"}
        description="Changing a reward later never changes vouchers already issued."
        footer={<>
          <Button variant="ghost" onClick={closeReward} disabled={busy}>Cancel</Button>
          <Button onClick={saveReward} disabled={busy}>{busy ? "Saving…" : rewardForm && rewardForm.id ? "Save changes" : "Add reward"}</Button>
        </>}>
        {rewardForm ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Reward name" htmlFor="reward-name"><input id="reward-name" style={inputStyle} value={rewardForm.draft.name} onChange={function (e) { setRewardField("name", e.target.value); }} placeholder="e.g. Free nail trim" /></Field>
            <Field label="Points cost" htmlFor="reward-cost"><input id="reward-cost" inputMode="numeric" style={inputStyle} value={rewardForm.draft.points_cost} onChange={function (e) { setRewardField("points_cost", e.target.value); }} /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={rewardForm.draft.active} onChange={function (e) { setRewardField("active", e.target.checked); }} /> Available to redeem
            </label>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!confirm} onClose={function () { if (!busy) { setConfirm(null); setErr(""); } }}
        title={!confirm ? "" : confirm.kind === "use" ? "Mark this voucher as used?" : "Cancel this voucher?"}
        footer={<>
          <Button variant="ghost" onClick={function () { setConfirm(null); setErr(""); }} disabled={busy}>Keep as is</Button>
          {confirm ? <Button variant={confirm.kind === "cancel" ? "danger" : undefined} onClick={resolveVoucher} disabled={busy}>{busy ? "Working…" : confirm.kind === "use" ? "Mark used" : "Cancel voucher"}</Button> : null}
        </>}>
        <p style={{ margin: 0, fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>
          {!confirm ? "" : confirm.kind === "use"
            ? "Do this once the reward has been applied at checkout. A used voucher can't be changed."
            : "The " + confirm.voucher.points_cost.toLocaleString() + " points go back to " + nameOf(confirm.voucher.customer_id) + ". A cancelled voucher can't be restored."}
        </p>
        <ErrorLine>{err}</ErrorLine>
      </Modal>
    </div>
  );
}
