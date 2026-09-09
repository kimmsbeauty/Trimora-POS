// Regression coverage for a real bug: several wa.me link builders did
// "https://wa.me/254" + salon.contact_phone directly. That only works
// if contact_phone is stored in local "0..." form. Kimms Beauty
// Parlour's contact_phone was already stored as "254113828280" (no
// leading 0), so the old code produced "2542541138282​80" -- an
// unreachable number -- for every low-stock and end-of-day WhatsApp
// notification. Locking down every format actually seen in the
// database so this can't silently regress.

import { normalizePhoneForWhatsApp } from "./utils.js";

describe("normalizePhoneForWhatsApp", () => {
  test("local format with leading 0 gets 254 prefix", () => {
    expect(normalizePhoneForWhatsApp("0113828280")).toBe("254113828280");
    expect(normalizePhoneForWhatsApp("0742944613")).toBe("254742944613");
  });

  test("already-international format is left as-is, not double-prefixed", () => {
    // This is the exact case that broke: Kimms' stored value already
    // includes the country code with no leading 0.
    expect(normalizePhoneForWhatsApp("254113828280")).toBe("254113828280");
  });

  test("leading + is stripped", () => {
    expect(normalizePhoneForWhatsApp("+254113828280")).toBe("254113828280");
  });

  test("whitespace is stripped", () => {
    expect(normalizePhoneForWhatsApp(" 0113 828 280 ")).toBe("254113828280");
  });

  test("null/empty input returns null rather than a broken link", () => {
    expect(normalizePhoneForWhatsApp(null)).toBeNull();
    expect(normalizePhoneForWhatsApp("")).toBeNull();
    expect(normalizePhoneForWhatsApp(undefined)).toBeNull();
  });
});
