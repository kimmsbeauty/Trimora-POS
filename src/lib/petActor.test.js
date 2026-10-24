// src/lib/petActor.test.js
import { getPetActor, setPetActor, clearPetActor } from "./petActor";

var GOOD = "123e4567-e89b-12d3-a456-426614174000";

describe("petActor (attribution only, per-tab)", () => {
  beforeEach(() => { sessionStorage.clear(); });

  it("starts with no actor", () => { expect(getPetActor()).toBeNull(); });
  it("remembers a valid staff id", () => { setPetActor(GOOD); expect(getPetActor()).toBe(GOOD); });
  it("clears on null / clearPetActor", () => {
    setPetActor(GOOD); setPetActor(null); expect(getPetActor()).toBeNull();
    setPetActor(GOOD); clearPetActor(); expect(getPetActor()).toBeNull();
  });
  it("refuses a malformed id instead of storing it", () => {
    setPetActor("not-a-uuid"); expect(getPetActor()).toBeNull();
    setPetActor("'; drop table staff;--"); expect(getPetActor()).toBeNull();
  });
  it("ignores a tampered value already in storage", () => {
    sessionStorage.setItem("trimora_pet_actor", "<script>");
    expect(getPetActor()).toBeNull();
  });
  it("uses sessionStorage, not localStorage (ends with the tab, not shared)", () => {
    setPetActor(GOOD);
    expect(localStorage.getItem("trimora_pet_actor")).toBeNull();
    expect(sessionStorage.getItem("trimora_pet_actor")).toBe(GOOD);
  });
});
