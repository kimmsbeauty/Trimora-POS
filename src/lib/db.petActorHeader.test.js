// src/lib/db.petActorHeader.test.js
//
// X-Pet-Actor (migration 087) must be sent ONLY on pet_* table requests, ONLY when an actor is
// selected, and must never change behaviour for Salon/Auto tables.
import { db } from "./db";
import { setCurrentSalonId } from "./currentSalon";
import { setPetActor } from "./petActor";

vi.mock("./deviceAuth", () => ({ getValidAccessToken: () => Promise.resolve("fake-device-token") }));

var GOOD = "123e4567-e89b-12d3-a456-426614174000";
var originalFetch = global.fetch;

function lastHeaders() { return global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].headers; }

describe("db.js X-Pet-Actor header", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setCurrentSalonId("real-salon-uuid-123");
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { global.fetch = originalFetch; console.error.mockRestore(); setCurrentSalonId(null); sessionStorage.clear(); });

  it("sends the header on a pet_* table when an actor is selected", async () => {
    setPetActor(GOOD);
    await db("GET", "pet_pets", null, "?select=*");
    expect(lastHeaders()["X-Pet-Actor"]).toBe(GOOD);
  });
  it("also on pet_* writes", async () => {
    setPetActor(GOOD);
    await db("PATCH", "pet_services", { price: 100 }, "?id=eq.abc");
    expect(lastHeaders()["X-Pet-Actor"]).toBe(GOOD);
  });
  it("sends nothing extra when no actor is selected (opt-in, behaviour unchanged)", async () => {
    await db("GET", "pet_pets", null, "?select=*");
    expect(lastHeaders()["X-Pet-Actor"]).toBeUndefined();
    expect(Object.keys(lastHeaders()).sort()).toEqual(["Authorization", "Content-Type", "Prefer", "apikey"]);
  });
  it("never sends it on non-pet tables (Salon/Auto/shared), even with an actor selected", async () => {
    setPetActor(GOOD);
    await db("GET", "customers", null, "?select=*");
    expect(lastHeaders()["X-Pet-Actor"]).toBeUndefined();
    await db("GET", "staff", null, "?select=*");
    expect(lastHeaders()["X-Pet-Actor"]).toBeUndefined();
    await db("GET", "auto_jobs", null, "?select=*");
    expect(lastHeaders()["X-Pet-Actor"]).toBeUndefined();
  });
  it("never sends a malformed actor", async () => {
    sessionStorage.setItem("trimora_pet_actor", "not-a-uuid");
    await db("GET", "pet_pets", null, "?select=*");
    expect(lastHeaders()["X-Pet-Actor"]).toBeUndefined();
  });
});
