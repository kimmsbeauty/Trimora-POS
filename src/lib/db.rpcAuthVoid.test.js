// src/lib/db.rpcAuthVoid.test.js
//
// A Postgres function that returns void is answered by PostgREST with 204 No Content and no body.
// dbRpcAuth must treat that as success (it used to throw on res.json() and report "Network error", which
// broke Settings > Google Calendar: Save and Sync now both call void functions).
import { dbRpcAuth } from "./db";

vi.mock("./deviceAuth", () => ({ getValidAccessToken: () => Promise.resolve("fake-device-token") }));

var originalFetch = global.fetch;

describe("dbRpcAuth with a void function", () => {
  afterEach(() => { global.fetch = originalFetch; });

  it("returns success (not a network error) for a 204 with no body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 204, json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    });
    var r = await dbRpcAuth("pet_calendar_resync", {});
    expect(r.error).toBeUndefined();
    expect(r.data).toBeNull();
  });
  it("still returns the JSON for a normal 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([{ id: 1 }]) });
    var r = await dbRpcAuth("some_function", {});
    expect(r.data).toEqual([{ id: 1 }]);
  });
  it("still reports a real network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    var r = await dbRpcAuth("pet_calendar_resync", {});
    expect(r.error).toBe("Network error");
  });
  it("still reports an HTTP error body", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ message: "NOT_CONNECTED" }) });
    var r = await dbRpcAuth("pet_calendar_resync", {});
    expect(r.error).toBe("NOT_CONNECTED");
  });
});
