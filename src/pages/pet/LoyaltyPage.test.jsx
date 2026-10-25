import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

import LoyaltyPage from "./LoyaltyPage";

var SETTINGS = { id: "st", enabled: true, kes_per_point: 100, visit_bonus: 0, silver_at: 500, gold_at: 2000 };
var CUSTOMERS = [{ id: "c1", name: "Wanjiru Kamau", phone: "0712 345 678" }, { id: "c2", name: "James Mwangi", phone: "0705000111" }, { id: "c3", name: "Naliaka Wekesa", phone: "" }];
var ACCOUNTS = [
  { id: "a1", customer_id: "c1", points_balance: 600, lifetime_earned: 600, lifetime_redeemed: 0 },
  { id: "a2", customer_id: "c2", points_balance: 900, lifetime_earned: 2100, lifetime_redeemed: 1200 },
];
var REWARDS = [
  { id: "r1", name: "Free nail trim", points_cost: 500, active: true },
  { id: "r2", name: "Free bath", points_cost: 1000, active: true },
  { id: "r3", name: "Retired reward", points_cost: 100, active: false },
];
var VOUCHERS = [
  { id: "v1", customer_id: "c1", reward_id: "r1", reward_name: "Free nail trim", points_cost: 500, status: "issued", issued_at: "2030-03-10T09:00:00Z" },
  { id: "v2", customer_id: "c2", reward_id: "r2", reward_name: "Free bath", points_cost: 1000, status: "used", issued_at: "2030-03-01T09:00:00Z" },
];
var LEDGER = [
  { id: "l2", customer_id: "c1", points: 6, balance_after: 606, reason: "earn_invoice", note: null, created_at: "2030-03-11T09:00:00Z" },
  { id: "l1", customer_id: "c1", points: -500, balance_after: 100, reason: "redeem", note: "Free nail trim", created_at: "2030-03-10T09:00:00Z" },
];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table, body, qs) {
    if (opts.getFail && table === "pet_loyalty_rewards") return Promise.resolve(null);
    if (method === "POST" && table === "pet_loyalty_rewards") return Promise.resolve(opts.postFail ? null : [Object.assign({ id: "r9" }, body)]);
    if (method === "PATCH") return Promise.resolve(opts.patchFail ? null : true);
    var map = {
      pet_loyalty_settings: opts.noSettings ? [] : [Object.assign({}, SETTINGS, opts.settings || {})], pet_loyalty_rewards: REWARDS,
      pet_loyalty_accounts: opts.accounts || ACCOUNTS, pet_loyalty_redemptions: opts.vouchers || VOUCHERS, customers: CUSTOMERS,
      pet_loyalty_ledger: LEDGER.filter(function (l) { return (qs || "").indexOf("customer_id=eq." + l.customer_id) !== -1; }),
    };
    return Promise.resolve(map[table] || []);
  });
  mockRpc.mockImplementation(function () { return Promise.resolve(opts.rpcError ? { error: opts.rpcError } : { data: null }); });
  return render(<LoyaltyPage canEdit={opts.canEdit !== false} />);
}
function rpc(name) { return mockRpc.mock.calls.filter(function (c) { return c[0] === name; })[0]; }
function modal() { return within(screen.getByRole("dialog")); }

describe("LoyaltyPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("says the programme is off, and that nothing is back-filled, until the owner turns it on", async function () {
    setup({ noSettings: true, accounts: [] });
    expect(await screen.findByText("The programme is off.")).toBeTruthy();
    expect(screen.getByText(/not back-filled/)).toBeTruthy();
    expect(screen.getByText("No members yet")).toBeTruthy();
  });

  it("lists members with tiers, biggest balance first, and totals", async function () {
    setup();
    expect(await screen.findByLabelText("Open James Mwangi")).toBeTruthy();
    expect(screen.queryByText("The programme is off.")).toBeNull();
    var names = screen.getAllByLabelText(/^Open (Wanjiru|James)/).map(function (b) { return b.getAttribute("aria-label"); });
    expect(names).toEqual(["Open James Mwangi", "Open Wanjiru Kamau"]);
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByText("1,500")).toBeTruthy(); // 600 + 900 outstanding
  });

  it("shows an error with retry, never an empty programme, when loading fails", async function () {
    setup({ getFail: true });
    expect(await screen.findByText("Couldn't load loyalty")).toBeTruthy();
    expect(screen.queryByText("No members yet")).toBeNull();
  });

  it("filters members by name or phone", async function () {
    setup();
    await screen.findByLabelText("Open James Mwangi");
    fireEvent.change(screen.getByLabelText("Search members"), { target: { value: "0712345" } });
    expect(screen.queryByLabelText("Open James Mwangi")).toBeNull();
    expect(screen.getByLabelText("Open Wanjiru Kamau")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search members"), { target: { value: "zzz" } });
    expect(await screen.findByText("No matching members")).toBeTruthy();
  });

  it("opens a member with balance, tier progress and history, and can open a customer with no points yet", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Open Wanjiru Kamau"));
    var m = modal();
    expect(await m.findByText(/Paid invoice/)).toBeTruthy();
    expect(m.getByText("600")).toBeTruthy();
    expect(m.getByText("Silver")).toBeTruthy();
    expect(m.getByText(/1,400 more points earned to reach Gold/)).toBeTruthy();
    expect(m.getByText("+6")).toBeTruthy();
    expect(m.getByText("-500")).toBeTruthy();
    var ledgerQuery = mockDb.mock.calls.filter(function (c) { return c[1] === "pet_loyalty_ledger"; })[0][3];
    expect(ledgerQuery).toContain("customer_id=eq.c1");
    fireEvent.click(m.getByText("Close"));
    fireEvent.change(screen.getByLabelText("Open a customer"), { target: { value: "c3" } });
    var m2 = modal();
    expect(await m2.findByText("No activity yet.")).toBeTruthy();
    expect(m2.getByText("Bronze")).toBeTruthy();
  });

  it("redeems a reward through the database function, only offering ones the balance can pay for", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Open Wanjiru Kamau")); // 600 points
    var m = modal();
    var opts = Array.prototype.slice.call(m.getByLabelText("Reward").querySelectorAll("option"));
    var byText = function (t) { return opts.filter(function (o) { return o.textContent.indexOf(t) === 0; })[0]; };
    expect(byText("Free nail trim").disabled).toBe(false);
    expect(byText("Free bath").disabled).toBe(true);
    expect(opts.some(function (o) { return o.textContent.indexOf("Retired reward") === 0; })).toBe(false);
    fireEvent.click(m.getByText("Redeem"));
    expect(await m.findByText("Choose a reward.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.change(m.getByLabelText("Reward"), { target: { value: "r1" } });
    fireEvent.click(m.getByText("Redeem"));
    await waitFor(function () { expect(rpc("pet_redeem_reward")).toBeTruthy(); });
    expect(rpc("pet_redeem_reward")[1]).toEqual({ p_customer_id: "c1", p_reward_id: "r1" });
    expect(await m.findByText(/Apply it at checkout/)).toBeTruthy();
  });

  it("shows the database's reason in plain words when redeeming is refused", async function () {
    setup({ rpcError: "INSUFFICIENT_POINTS" });
    fireEvent.click(await screen.findByLabelText("Open Wanjiru Kamau"));
    var m = modal();
    fireEvent.change(m.getByLabelText("Reward"), { target: { value: "r1" } });
    fireEvent.click(m.getByText("Redeem"));
    expect(await m.findByText("Not enough points for that.")).toBeTruthy();
  });

  it("blocks redeeming while the programme is off", async function () {
    setup({ settings: { enabled: false } });
    fireEvent.click(await screen.findByLabelText("Open Wanjiru Kamau"));
    var m = modal();
    expect(m.getByText("Redeem").closest("button").disabled).toBe(true);
    expect(m.getByText(/Switch the programme on under Rules/)).toBeTruthy();
  });

  it("adjusts points for admins only, requiring a reason and refusing to go below zero", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Open Wanjiru Kamau"));
    var m = modal();
    fireEvent.change(m.getByLabelText("Points to add or remove"), { target: { value: "100" } });
    fireEvent.click(m.getByText("Apply"));
    expect(await m.findByText("Add a note saying why.")).toBeTruthy();
    fireEvent.change(m.getByLabelText("Points to add or remove"), { target: { value: "-700" } });
    fireEvent.change(m.getByLabelText("Reason for adjustment"), { target: { value: "Correction" } });
    fireEvent.click(m.getByText("Apply"));
    expect(await m.findByText("That would take the balance below zero.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.change(m.getByLabelText("Points to add or remove"), { target: { value: "100" } });
    fireEvent.change(m.getByLabelText("Reason for adjustment"), { target: { value: "Goodwill" } });
    fireEvent.click(m.getByText("Apply"));
    await waitFor(function () { expect(rpc("pet_adjust_loyalty")[1]).toEqual({ p_customer_id: "c1", p_points: 100, p_note: "Goodwill" }); });
  });

  it("hides adjusting, reward editing and rule saving from non-admins", async function () {
    setup({ canEdit: false });
    fireEvent.click(await screen.findByLabelText("Open Wanjiru Kamau"));
    expect(modal().queryByLabelText("Points to add or remove")).toBeNull();
    fireEvent.click(modal().getByText("Close"));
    fireEvent.click(screen.getByLabelText("Tab: Rewards"));
    expect(await screen.findByText("Free bath")).toBeTruthy();
    expect(screen.queryByText("+ Add reward")).toBeNull();
    expect(screen.queryByLabelText("Edit Free bath")).toBeNull();
    fireEvent.click(screen.getByLabelText("Tab: Rules"));
    expect(await screen.findByText(/Only an administrator can change the rules/)).toBeTruthy();
    expect(screen.queryByText("Save rules")).toBeNull();
    expect(screen.getByLabelText("Spend (KES) per point").disabled).toBe(true);
  });

  it("adds, edits and switches off rewards, refusing duplicate names", async function () {
    setup();
    await screen.findByLabelText("Open James Mwangi");
    fireEvent.click(screen.getByLabelText("Tab: Rewards"));
    fireEvent.click(await screen.findByText("+ Add reward"));
    var m = modal();
    fireEvent.change(m.getByLabelText("Reward name"), { target: { value: " free BATH " } });
    fireEvent.change(m.getByLabelText("Points cost"), { target: { value: "800" } });
    fireEvent.click(m.getByRole("button", { name: "Add reward" }));
    expect(await m.findByText("You already have a reward with that name.")).toBeTruthy();
    fireEvent.change(m.getByLabelText("Reward name"), { target: { value: "Treat bag" } });
    fireEvent.click(m.getByRole("button", { name: "Add reward" }));
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "POST" && c[1] === "pet_loyalty_rewards"; })).toBe(true); });
    var post = mockDb.mock.calls.filter(function (c) { return c[0] === "POST"; })[0];
    expect(post[2]).toEqual({ name: "Treat bag", points_cost: 800, active: true });
    fireEvent.click(await screen.findByLabelText("Switch off Free bath"));
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "PATCH" && c[2].active === false && c[3] === "?id=eq.r2"; })).toBe(true); });
    fireEvent.click(screen.getByLabelText("Edit Free nail trim"));
    fireEvent.change(modal().getByLabelText("Points cost"), { target: { value: "450" } });
    fireEvent.click(modal().getByRole("button", { name: "Save changes" }));
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "PATCH" && c[2].points_cost === 450 && c[3] === "?id=eq.r1"; })).toBe(true); });
  });

  it("does not claim a reward was saved when saving fails", async function () {
    setup({ postFail: true });
    await screen.findByLabelText("Open James Mwangi");
    fireEvent.click(screen.getByLabelText("Tab: Rewards"));
    fireEvent.click(await screen.findByText("+ Add reward"));
    fireEvent.change(modal().getByLabelText("Reward name"), { target: { value: "Treat bag" } });
    fireEvent.change(modal().getByLabelText("Points cost"), { target: { value: "800" } });
    fireEvent.click(modal().getByRole("button", { name: "Add reward" }));
    expect(await modal().findByText(/Couldn't save the reward/)).toBeTruthy();
  });

  it("marks a voucher used or cancels it with a refund, and leaves resolved vouchers alone", async function () {
    setup();
    await screen.findByLabelText("Open James Mwangi");
    fireEvent.click(screen.getByLabelText("Tab: Vouchers"));
    expect(await screen.findByText("Used")).toBeTruthy();
    expect(screen.queryByLabelText(/Mark Free bath used/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Cancel Free nail trim for Wanjiru Kamau"));
    expect(await screen.findByText(/500 points go back to Wanjiru Kamau/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel voucher" }));
    await waitFor(function () { expect(rpc("pet_set_redemption_status")[1]).toEqual({ p_id: "v1", p_status: "cancelled" }); });
    mockRpc.mockClear();
    fireEvent.click(await screen.findByLabelText("Mark Free nail trim used for Wanjiru Kamau"));
    fireEvent.click(screen.getByRole("button", { name: "Mark used" }));
    await waitFor(function () { expect(rpc("pet_set_redemption_status")[1]).toEqual({ p_id: "v1", p_status: "used" }); });
  });

  it("saves the rules through the database function and refuses a Gold threshold at or below Silver", async function () {
    setup();
    await screen.findByLabelText("Open James Mwangi");
    fireEvent.click(screen.getByLabelText("Tab: Rules"));
    expect(await screen.findByText(/earns 15 points when it is paid/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Gold from (lifetime points)"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Save rules"));
    expect(await screen.findByText("The Gold threshold must be higher than Silver.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Gold from (lifetime points)"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Spend (KES) per point"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Visit bonus (points per completed appointment, 0 for none)"), { target: { value: "25" } });
    expect(await screen.findByText(/earns 30 points when it is paid/)).toBeTruthy();
    fireEvent.click(screen.getByText("Save rules"));
    await waitFor(function () { expect(rpc("pet_save_loyalty_settings")).toBeTruthy(); });
    expect(rpc("pet_save_loyalty_settings")[1]).toEqual({ p_enabled: true, p_kes_per_point: 50, p_visit_bonus: 25, p_silver_at: 500, p_gold_at: 3000 });
  });
});
