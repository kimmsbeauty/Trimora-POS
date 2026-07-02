// src/lib/salonHealth.test.js
//
// Covers the logic that decides which salons the super admin sees
// flagged as needing attention, and how platform revenue is
// aggregated. Both drive real operational decisions (who gets
// contacted, whose subscription is about to lapse) so a bug here is
// an operational bug, not a cosmetic one.

import {
  getHealthFlags,
  salonsNeedingAttention,
  revenueByMonth,
  salonsByMonth,
  revenueBySalon,
} from "./salonHealth";

var FIXED_NOW = new Date("2026-07-02T12:00:00Z");

describe("getHealthFlags", () => {
  it("flags a suspended salon as high severity", () => {
    var flags = getHealthFlags({ suspended: true }, FIXED_NOW);
    expect(flags).toContainEqual({ severity: "high", label: "Suspended" });
  });

  it("does not flag a salon with no issues", () => {
    var healthy = {
      suspended: false,
      sale_count: 10, staff_count: 2, service_count: 5,
      subscription_status: "lifetime",
    };
    expect(getHealthFlags(healthy, FIXED_NOW)).toEqual([]);
  });

  it("flags an already-expired subscription as high severity", () => {
    var s = { subscription_expires_at: "2026-06-01T00:00:00Z", subscription_status: "active" };
    var flags = getHealthFlags(s, FIXED_NOW);
    expect(flags).toContainEqual({ severity: "high", label: "Subscription expired" });
  });

  it("flags a subscription expiring within 7 days as medium severity, with correct day count", () => {
    // FIXED_NOW is 2026-07-02; 5 days later is 2026-07-07
    var s = { subscription_expires_at: "2026-07-07T12:00:00Z", subscription_status: "active" };
    var flags = getHealthFlags(s, FIXED_NOW);
    expect(flags).toContainEqual({ severity: "medium", label: "Expires in 5 days" });
  });

  it("uses singular 'day' (not 'days') when exactly 1 day remains", () => {
    var s = { subscription_expires_at: "2026-07-03T12:00:00Z", subscription_status: "active" };
    var flags = getHealthFlags(s, FIXED_NOW);
    expect(flags).toContainEqual({ severity: "medium", label: "Expires in 1 day" });
  });

  it("does NOT flag a subscription expiring more than 7 days out", () => {
    var s = { subscription_expires_at: "2026-07-20T12:00:00Z", subscription_status: "active" };
    var flags = getHealthFlags(s, FIXED_NOW);
    expect(flags.find(function(f) { return f.label.indexOf("Expires") === 0; })).toBeUndefined();
  });

  it("never flags a lifetime subscription for expiry, no matter the date", () => {
    var s = { subscription_expires_at: "2020-01-01T00:00:00Z", subscription_status: "lifetime" };
    var flags = getHealthFlags(s, FIXED_NOW);
    expect(flags.find(function(f) { return f.label.indexOf("Expir") === 0; })).toBeUndefined();
  });

  it("flags zero sales, zero staff, and zero services independently", () => {
    var s = { sale_count: 0, staff_count: 0, service_count: 0 };
    var flags = getHealthFlags(s, FIXED_NOW);
    expect(flags).toContainEqual({ severity: "medium", label: "Zero sales recorded" });
    expect(flags).toContainEqual({ severity: "low", label: "No staff added" });
    expect(flags).toContainEqual({ severity: "low", label: "No services added" });
  });

  it("treats missing (undefined) counts the same as zero, without throwing", () => {
    var flags = getHealthFlags({}, FIXED_NOW);
    expect(flags).toContainEqual({ severity: "medium", label: "Zero sales recorded" });
  });

  it("a salon can accumulate multiple flags at once", () => {
    var s = { suspended: true, sale_count: 0, staff_count: 0, service_count: 0 };
    expect(getHealthFlags(s, FIXED_NOW).length).toBe(4);
  });
});

describe("salonsNeedingAttention", () => {
  it("excludes healthy salons entirely", () => {
    var healthy = { id: "1", suspended: false, sale_count: 5, staff_count: 1, service_count: 1, subscription_status: "lifetime" };
    var result = salonsNeedingAttention([healthy], FIXED_NOW);
    expect(result).toEqual([]);
  });

  it("sorts salons with a high-severity flag before medium/low-only salons", () => {
    var lowOnly  = { id: "low",  suspended: false, sale_count: 5, staff_count: 0, service_count: 5, subscription_status: "lifetime" };
    var highOne  = { id: "high", suspended: true,  sale_count: 5, staff_count: 1, service_count: 5, subscription_status: "lifetime" };
    var result = salonsNeedingAttention([lowOnly, highOne], FIXED_NOW);
    expect(result[0].salon.id).toBe("high");
    expect(result[1].salon.id).toBe("low");
  });

  it("handles an empty salon list", () => {
    expect(salonsNeedingAttention([], FIXED_NOW)).toEqual([]);
  });
});

describe("revenueByMonth", () => {
  it("groups payments by month/year label and sums amounts", () => {
    var payments = [
      { payment_date: "2026-06-15T00:00:00Z", amount: 1000 },
      { payment_date: "2026-06-20T00:00:00Z", amount: 500 },
      { payment_date: "2026-07-01T00:00:00Z", amount: 2000 },
    ];
    var result = revenueByMonth(payments);
    var june = result.find(function(r) { return r.label.indexOf("Jun") === 0; });
    expect(june.value).toBe(1500);
  });

  it("treats a missing/null amount as 0 rather than NaN", () => {
    var payments = [{ payment_date: "2026-06-15T00:00:00Z", amount: null }];
    var result = revenueByMonth(payments);
    expect(Number.isNaN(result[0].value)).toBe(false);
    expect(result[0].value).toBe(0);
  });

  it("returns an empty array for no payments", () => {
    expect(revenueByMonth([])).toEqual([]);
  });
});

describe("salonsByMonth", () => {
  it("counts salons created per month", () => {
    var salons = [
      { created_at: "2026-06-01T00:00:00Z" },
      { created_at: "2026-06-15T00:00:00Z" },
      { created_at: "2026-07-01T00:00:00Z" },
    ];
    var result = salonsByMonth(salons);
    var june = result.find(function(r) { return r.label.indexOf("Jun") === 0; });
    expect(june.value).toBe(2);
  });

  it("skips salons with no created_at rather than throwing", () => {
    var salons = [{ created_at: null }, { created_at: "2026-06-01T00:00:00Z" }];
    expect(function() { salonsByMonth(salons); }).not.toThrow();
    var result = salonsByMonth(salons);
    var totalCounted = result.reduce(function(s, r) { return s + r.value; }, 0);
    expect(totalCounted).toBe(1);
  });
});

describe("revenueBySalon", () => {
  var salons = [{ id: "s1", name: "Kimm's Beauty", salon_number: "001" }];

  it("sums payments per salon and attaches the salon's name/number", () => {
    var payments = [
      { salon_id: "s1", amount: 1000 },
      { salon_id: "s1", amount: 500 },
    ];
    var result = revenueBySalon(payments, salons);
    expect(result[0]).toEqual({ salonId: "s1", name: "Kimm's Beauty", number: "001", value: 1500 });
  });

  it("labels a payment against an unknown/deleted salon as 'Unknown salon' rather than crashing", () => {
    var payments = [{ salon_id: "does-not-exist", amount: 100 }];
    var result = revenueBySalon(payments, salons);
    expect(result[0].name).toBe("Unknown salon");
    expect(result[0].number).toBeNull();
  });

  it("sorts salons by revenue descending", () => {
    var multiSalons = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    var payments = [
      { salon_id: "a", amount: 100 },
      { salon_id: "b", amount: 900 },
    ];
    var result = revenueBySalon(payments, multiSalons);
    expect(result[0].salonId).toBe("b");
    expect(result[1].salonId).toBe("a");
  });
});
