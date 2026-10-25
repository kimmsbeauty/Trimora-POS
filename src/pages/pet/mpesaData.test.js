import { normalizeKenyanPhone, interpretStatus, mpesaErrorMessage } from "./mpesaData";

describe("mpesaData", function () {
  it("normalises Safaricom numbers and rejects the rest", function () {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254 112 345 678")).toBe("254112345678");
    expect(normalizeKenyanPhone("712345678")).toBe("254712345678");
    expect(normalizeKenyanPhone("0212345678")).toBeNull();
    expect(normalizeKenyanPhone("")).toBeNull();
    expect(normalizeKenyanPhone(null)).toBeNull();
  });

  it("only treats a push as confirmed when it has a receipt", function () {
    expect(interpretStatus([{ status: "confirmed", mpesa_receipt: "QWE123", amount: 500 }]).state).toBe("confirmed");
    expect(interpretStatus([{ status: "confirmed", mpesa_receipt: null }]).state).toBe("waiting");
    expect(interpretStatus([{ status: "pending" }]).state).toBe("waiting");
    expect(interpretStatus([{ status: "failed", result_desc: "Cancelled by user" }])).toEqual({ state: "failed", reason: "Cancelled by user" });
    expect(interpretStatus([]).state).toBe("waiting");
    expect(interpretStatus("ok").state).toBe("waiting");
  });

  it("gives plain messages", function () {
    expect(mpesaErrorMessage("M-Pesa not configured for this salon")).toMatch(/Till number/);
    expect(mpesaErrorMessage("whatever")).toMatch(/didn't go through/);
  });
});
