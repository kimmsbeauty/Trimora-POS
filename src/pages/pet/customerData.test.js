import {
  validateCustomer, customerRow, profileRow, isDuplicateCustomer, filterCustomers, isValidEmail,
} from "./customerData";

var base = { name: "Wanjiru Kamau", phone: "0712 345 678", email: "", emergency_contact_name: "", emergency_contact_phone: "", preferred_channels: [] };

describe("validateCustomer", function () {
  it("accepts a minimal customer", function () { expect(validateCustomer(base)).toBe(""); });
  it("requires a name", function () { expect(validateCustomer(Object.assign({}, base, { name: "  " }))).toMatch(/name is required/); });
  it("rejects a short phone but allows an empty one", function () {
    expect(validateCustomer(Object.assign({}, base, { phone: "123" }))).toMatch(/valid phone/);
    expect(validateCustomer(Object.assign({}, base, { phone: "" }))).toBe("");
  });
  it("rejects a bad email", function () { expect(validateCustomer(Object.assign({}, base, { email: "nope@" }))).toMatch(/valid email/); });
  it("rejects a short emergency number", function () { expect(validateCustomer(Object.assign({}, base, { emergency_contact_phone: "12" }))).toMatch(/emergency/); });
  it("rejects unknown channels and email channel without an email", function () {
    expect(validateCustomer(Object.assign({}, base, { preferred_channels: ["pigeon"] }))).toMatch(/Unknown/);
    expect(validateCustomer(Object.assign({}, base, { preferred_channels: ["email"] }))).toMatch(/Add an email/);
    expect(validateCustomer(Object.assign({}, base, { email: "a@b.co", preferred_channels: ["email", "sms"] }))).toBe("");
  });
});

describe("rows", function () {
  it("customerRow trims and nulls an empty phone", function () {
    expect(customerRow({ name: " Jo ", phone: " " })).toEqual({ name: "Jo", phone: null });
  });
  it("profileRow lowercases email, nulls blanks, dedupes channels", function () {
    var r = profileRow({ email: " A@B.CO ", address: "", emergency_contact_name: "Sam", emergency_contact_phone: "", preferred_channels: ["sms", "sms", "email"], notes: "" });
    expect(r).toEqual({ email: "a@b.co", address: null, emergency_contact_name: "Sam", emergency_contact_phone: null, preferred_channels: ["sms", "email"], notes: null });
  });
});

describe("isDuplicateCustomer", function () {
  var list = [{ id: "1", phone: "+254 712-345-678" }, { id: "2", phone: null }];
  it("matches the same digits regardless of formatting", function () {
    expect(isDuplicateCustomer(list, { phone: "254712345678" })).toBe(true);
  });
  it("ignores the record being edited and empty phones", function () {
    expect(isDuplicateCustomer(list, { phone: "254712345678" }, "1")).toBe(false);
    expect(isDuplicateCustomer(list, { phone: null })).toBe(false);
  });
});

describe("filterCustomers", function () {
  var customers = [{ id: "1", name: "Wanjiru", phone: "0712345678" }, { id: "2", name: "James", phone: "0705111222" }];
  var profiles = { 2: { email: "james@example.com" } };
  var pets = { 1: [{ name: "Simba" }] };
  it("returns all when the query is empty", function () { expect(filterCustomers(customers, profiles, pets, "").length).toBe(2); });
  it("matches name, phone digits, email and pet name", function () {
    expect(filterCustomers(customers, profiles, pets, "wanj").map(function (c) { return c.id; })).toEqual(["1"]);
    expect(filterCustomers(customers, profiles, pets, "0705").map(function (c) { return c.id; })).toEqual(["2"]);
    expect(filterCustomers(customers, profiles, pets, "james@").map(function (c) { return c.id; })).toEqual(["2"]);
    expect(filterCustomers(customers, profiles, pets, "simba").map(function (c) { return c.id; })).toEqual(["1"]);
  });
});

describe("isValidEmail", function () {
  it("basic shapes", function () { expect(isValidEmail("a@b.co")).toBe(true); expect(isValidEmail("a b@c.d")).toBe(false); });
});
