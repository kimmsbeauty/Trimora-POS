import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); } }));
// jsdom has no layout, so the chart container renders nothing; keep the test about the numbers.
vi.mock("recharts", () => {
  var Pass = function (props) { return <div>{props.children}</div>; };
  return { BarChart: Pass, Bar: Pass, XAxis: Pass, YAxis: Pass, CartesianGrid: Pass, Tooltip: Pass, ResponsiveContainer: Pass };
});

import ReportsPage from "./ReportsPage";

function today(h) { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 10, 0).toISOString(); }
function dayKey(offset) {
  var d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (offset || 0));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

var BASE = {
  pet_payments: [
    { id: "p1", invoice_id: "i1", method: "cash", amount: 1000, paid_at: today(9) },
    { id: "p2", invoice_id: "i1", method: "mpesa", amount: 2000, paid_at: today(11) },
  ],
  pet_invoices: [{ id: "i1", customer_id: "c1", status: "paid", total: 3000, discount_amount: 0, tax_amount: 0, amount_paid: 3000, issued_at: today(9) }],
  pet_invoice_lines: [{ id: "l1", invoice_id: "i1", service_id: "s1", description: "Full groom", quantity: 1, line_total: 3000 }],
  pet_bookings: [{ id: "b1", staff_id: "st1", status: "completed", starts_at: today(9) }, { id: "b2", staff_id: "st1", status: "cancelled", starts_at: today(12) }],
  pet_boarding_stays: [{ id: "s1", kennel_id: "k1", status: "occupied", check_in_on: dayKey(-1), check_out_on: dayKey(2) }],
  pet_kennels: [{ id: "k1" }, { id: "k2" }],
  customers: [{ id: "c1", name: "Wanjiru Kamau" }],
  staff: [{ id: "st1", name: "Amina" }],
};
var OPEN = [
  { id: "o1", invoice_number: "INV-0007", customer_id: "c1", status: "partial", total: 4000, amount_paid: 1000, due_date: dayKey(-5), issued_at: today(9) },
];

function install(overrides) {
  overrides = overrides || {};
  mockDb.mockImplementation(function (method, table, data, qs) {
    if (overrides[table + ":" + (qs.indexOf("status=in.") !== -1 ? "open" : "main")]) return overrides[table + ":" + (qs.indexOf("status=in.") !== -1 ? "open" : "main")](qs);
    if (overrides[table]) return overrides[table](qs);
    if (table === "pet_invoices" && qs.indexOf("status=in.") !== -1) return Promise.resolve(OPEN);
    return Promise.resolve(BASE[table] || []);
  });
  render(<ReportsPage />);
}
// The figure shown in the card with this label.
function statValue(label) { return screen.getByText(label).nextSibling.textContent; }
function calls(table) { return mockDb.mock.calls.filter(function (c) { return c[1] === table; }); }

describe("ReportsPage", function () {
  beforeEach(function () { mockDb.mockReset(); });

  it("loads the last 7 days by default and shows the headline figures", async function () {
    install();
    expect(await screen.findByText("Collected")).toBeTruthy();
    expect(statValue("Collected")).toBe("KES 3,000"); // 1000 + 2000
    expect(screen.getByText("2 payments received")).toBeTruthy();
    expect(statValue("Invoiced")).toBe("KES 3,000");
    expect(screen.getByText("1 invoice · avg KES 3,000")).toBeTruthy();
    expect(statValue("Still owed (all open invoices)")).toBe("KES 3,000");
    expect(screen.getByText("KES 3,000 overdue (1)")).toBeTruthy(); // 4000 - 1000, due 5 days ago
    expect(statValue("Bookings")).toBe("2");
    expect(screen.getByText("1 cancelled or no-show (50%)")).toBeTruthy();
    expect(statValue("Boarding occupancy")).toBe("14%"); // stay covers 2 days in the window; 2 kennels x 7 days = 14 kennel-days
    expect(screen.getByText("INV-0007", { exact: false })).toBeTruthy();
    expect(screen.getByText("Full groom")).toBeTruthy();
  });

  it("asks only for the chosen period, paged, and keeps the old-invoice query free of dates", async function () {
    install();
    await screen.findByText("Collected");
    var start = new Date(); start = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 6).toISOString();
    var q = calls("pet_payments")[0][3];
    expect(q).toContain("paid_at=gte." + start);
    expect(q).toContain("paid_at=lt.");
    expect(q).toContain("&limit=1000&offset=0");
    var openQ = calls("pet_invoices").filter(function (c) { return c[3].indexOf("status=in.(issued,partial)") !== -1; })[0][3];
    expect(openQ).not.toContain("issued_at=gte");
    calls("pet_payments").concat(calls("pet_bookings")).forEach(function (c) { expect(c[0]).toBe("GET"); });
    expect(mockDb.mock.calls.every(function (c) { return c[0] === "GET"; })).toBe(true);
  });

  it("refetches when the period changes", async function () {
    install();
    await screen.findByText("Collected");
    var before = calls("pet_payments").length;
    fireEvent.click(screen.getByLabelText("Period: Today"));
    await waitFor(function () { expect(calls("pet_payments").length).toBeGreaterThan(before); });
    var last = calls("pet_payments").pop()[3];
    var t = new Date(); var from = new Date(t.getFullYear(), t.getMonth(), t.getDate()).toISOString();
    expect(last).toContain("paid_at=gte." + from);
  });

  it("reads every page of a large period and totals all of it", async function () {
    var pages = 0;
    install({
      pet_payments: function (qs) {
        pages += 1;
        var off = Number(/offset=(\d+)/.exec(qs)[1]);
        var n = off === 0 ? 1000 : 5;
        return Promise.resolve(Array.from({ length: n }, function (_, i) { return { id: "x" + off + "-" + i, invoice_id: "i1", method: "cash", amount: 10, paid_at: today(9) }; }));
      },
    });
    expect(await screen.findByText("1005 payments received")).toBeTruthy();
    expect(screen.getByText("KES 10,050", { selector: "div" })).toBeTruthy();
    expect(pages).toBe(2);
    expect(screen.queryByText("Incomplete")).toBeNull();
  });

  it("says the figures are incomplete when a period is too big to load", async function () {
    install({
      pet_payments: function () { return Promise.resolve(Array.from({ length: 1000 }, function (_, i) { return { id: "y" + Math.random() + i, invoice_id: "i1", method: "cash", amount: 1, paid_at: today(9) }; })); },
    });
    expect(await screen.findByText("Incomplete")).toBeTruthy();
    expect(screen.getByText(/Choose a shorter period/)).toBeTruthy();
    expect(calls("pet_payments").length).toBe(10);
  });

  it("shows an error with retry, never zeros, when a request fails", async function () {
    var fail = true;
    install({ pet_bookings: function () { return Promise.resolve(fail ? null : []); } });
    expect(await screen.findByText("Couldn't load the report")).toBeTruthy();
    expect(screen.queryByText("Collected")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("Collected")).toBeTruthy();
  });

  it("says plainly when nothing was recorded", async function () {
    mockDb.mockImplementation(function () { return Promise.resolve([]); });
    render(<ReportsPage />);
    expect(await screen.findByText("Nothing to report for this period")).toBeTruthy();
  });

  it("waits for a valid custom range before loading anything", async function () {
    install();
    await screen.findAllByText("Collected");
    mockDb.mockClear();
    fireEvent.click(screen.getAllByLabelText("Period: Custom")[0]);
    expect(await screen.findByText(/Choose a start and end date/)).toBeTruthy();
    expect(mockDb).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: dayKey(-3) } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: dayKey(-5) } });
    fireEvent.click(screen.getByText("Show report"));
    expect(await screen.findByText("The end date can't be before the start date.")).toBeTruthy();
    expect(mockDb).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: dayKey(-1) } });
    fireEvent.click(screen.getByText("Show report"));
    await waitFor(function () { expect(calls("pet_payments").length).toBeGreaterThan(0); });
    var d = dayKey(-3).split("-");
    expect(calls("pet_payments")[0][3]).toContain("paid_at=gte." + new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2])).toISOString());
  });

  it("ignores a slow response for a period that is no longer selected", async function () {
    var resolveFirst;
    var first = true;
    install({
      pet_payments: function () {
        if (first) { first = false; return new Promise(function (r) { resolveFirst = function () { r([{ id: "old", invoice_id: "i1", method: "cash", amount: 99999, paid_at: today(9) }]); }; }); }
        return Promise.resolve([{ id: "new", invoice_id: "i1", method: "cash", amount: 1234, paid_at: today(9) }]);
      },
    });
    await waitFor(function () { expect(calls("pet_payments").length).toBe(1); });
    fireEvent.click(screen.getAllByLabelText("Period: Today")[0]);
    expect(await screen.findByText("KES 1,234", { selector: "div" })).toBeTruthy();
    resolveFirst();
    await new Promise(function (r) { setTimeout(r, 30); });
    expect(screen.queryByText("KES 99,999", { selector: "div" })).toBeNull();
    expect(screen.getByText("KES 1,234", { selector: "div" })).toBeTruthy();
  });
});
