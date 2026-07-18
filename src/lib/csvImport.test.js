// src/lib/csvImport.test.js
//
// Pure-logic tests for the CSV import feature -- no mocked db(), no
// network. parseAndValidate is tested against real papaparse (an
// actual npm dependency, not a mock) since the whole point is
// verifying real-world CSV quirks (quoted commas, header casing) are
// handled correctly, matching saleLogic.test.js's "test the real thing,
// not a stand-in for it" convention. commitImport is deliberately not
// tested here since it calls db() -> real network; that's an
// integration concern, not a unit one.

import {
  parseAndValidate,
  SALON_SERVICES_CONFIG,
  AUTO_SERVICES_CONFIG,
  STOCK_CONFIG,
} from "./csvImport";

function csvFile(text) {
  return new File([text], "test.csv", { type: "text/csv" });
}

describe("parseAndValidate -- salon services", () => {
  it("marks every row as new when nothing matches existing rows", async () => {
    var file = csvFile("name,category,price\nHaircut,Hair,500\nManicure,Nails,800\n");
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, []);
    expect(result.parseError).toBe(null);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].status).toBe("new");
    expect(result.rows[0].fields).toEqual({ name: "Haircut", category: "Hair", price: 500 });
    expect(result.rows[1].status).toBe("new");
  });

  it("matches existing rows by name, case-insensitively and trimmed", async () => {
    var file = csvFile("name,category,price\n  Haircut  ,Hair,600\n");
    var existing = [{ id: "svc-1", name: "haircut" }];
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, existing);
    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].matchId).toBe("svc-1");
    expect(result.rows[0].fields.price).toBe(600);
  });

  it("flags a missing required field as an error row, not a silent skip", async () => {
    var file = csvFile("name,category,price\n,Hair,500\n");
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, []);
    expect(result.rows[0].status).toBe("error");
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
    expect(result.rows[0].errors[0]).toMatch(/name is required/i);
  });

  it("flags a non-numeric price as an error rather than silently coercing to 0/NaN", async () => {
    var file = csvFile("name,category,price\nHaircut,Hair,free\n");
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, []);
    expect(result.rows[0].status).toBe("error");
    expect(result.rows[0].errors[0]).toMatch(/price must be a number/i);
  });

  it("is tolerant of header casing and surrounding whitespace", async () => {
    var file = csvFile("Name , Category ,PRICE\nHaircut,Hair,500\n");
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, []);
    expect(result.rows[0].status).toBe("new");
    expect(result.rows[0].fields.price).toBe(500);
  });

  it("correctly handles a quoted field containing a comma -- the exact case a hand-rolled split(',') would break on", async () => {
    var file = csvFile('name,category,price\n"Wash, Wax & Dry",Hair,1200\n');
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, []);
    expect(result.rows[0].fields.name).toBe("Wash, Wax & Dry");
    expect(result.rows[0].fields.price).toBe(1200);
    expect(result.rows[0].status).toBe("new");
  });

  it("reports a parseError instead of a confusing empty state when the file has no data rows", async () => {
    var file = csvFile("name,category,price\n");
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, []);
    expect(result.parseError).toMatch(/no rows found/i);
    expect(result.rows).toEqual([]);
  });

  it("line numbers account for the header row, so they match what a person sees in a spreadsheet", async () => {
    var file = csvFile("name,category,price\nHaircut,Hair,500\nManicure,Nails,800\n");
    var result = await parseAndValidate(file, SALON_SERVICES_CONFIG, []);
    expect(result.rows[0].line).toBe(2);
    expect(result.rows[1].line).toBe(3);
  });
});

describe("parseAndValidate -- auto services (no category column, optional fields)", () => {
  it("treats description and duration_minutes as optional", async () => {
    var file = csvFile("name,description,duration_minutes,price\nBasic wash,,,500\n");
    var result = await parseAndValidate(file, AUTO_SERVICES_CONFIG, []);
    expect(result.rows[0].status).toBe("new");
    expect(result.rows[0].fields.description).toBe("");
    expect(result.rows[0].fields.duration_minutes).toBe(null);
  });

  it("still requires name and price", async () => {
    var file = csvFile("name,description,duration_minutes,price\n,,,500\n");
    var result = await parseAndValidate(file, AUTO_SERVICES_CONFIG, []);
    expect(result.rows[0].status).toBe("error");
  });
});

describe("parseAndValidate -- stock/products (shared salon + auto table)", () => {
  it("requires stock_qty as a number", async () => {
    var file = csvFile("name,category,price,stock_qty\nShampoo,Hair,800,20\n");
    var result = await parseAndValidate(file, STOCK_CONFIG, []);
    expect(result.rows[0].status).toBe("new");
    expect(result.rows[0].fields.stock_qty).toBe(20);
  });

  it("matches existing products by name for update", async () => {
    var file = csvFile("name,category,price,stock_qty\nShampoo,Hair,900,25\n");
    var existing = [{ id: "PRD001", name: "Shampoo" }];
    var result = await parseAndValidate(file, STOCK_CONFIG, existing);
    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].matchId).toBe("PRD001");
  });
});

describe("row-building configs", () => {
  it("SALON_SERVICES_CONFIG.buildRow maps category -> cat and defaults active true", () => {
    var row = SALON_SERVICES_CONFIG.buildRow({ name: "Haircut", category: "Hair", price: 500 });
    expect(row).toEqual({ name: "Haircut", cat: "Hair", price: 500, active: true });
  });

  it("SALON_SERVICES_CONFIG.buildUpdate never touches active, unlike buildRow", () => {
    var row = SALON_SERVICES_CONFIG.buildUpdate({ name: "Haircut", category: "Hair", price: 500 });
    expect(row.active).toBeUndefined();
  });

  it("AUTO_SERVICES_CONFIG.buildRow nulls out empty optional fields rather than writing empty strings", () => {
    var row = AUTO_SERVICES_CONFIG.buildRow({ name: "Basic wash", description: "", duration_minutes: null, price: 500 });
    expect(row.description).toBe(null);
    expect(row.duration_minutes).toBe(null);
  });

  it("STOCK_CONFIG.buildRow generates a unique id per row using the batch index, avoiding Date.now() collisions in a bulk insert", () => {
    var rowA = STOCK_CONFIG.buildRow({ name: "Shampoo", category: "Hair", price: 800, stock_qty: 20 }, 0);
    var rowB = STOCK_CONFIG.buildRow({ name: "Conditioner", category: "Hair", price: 900, stock_qty: 15 }, 1);
    expect(rowA.id).not.toBe(rowB.id);
    expect(rowA.id).toMatch(/^PRD\d+-0$/);
    expect(rowB.id).toMatch(/^PRD\d+-1$/);
  });

  it("STOCK_CONFIG.buildUpdate maps stock_qty -> stock (the actual column name)", () => {
    var row = STOCK_CONFIG.buildUpdate({ name: "Shampoo", category: "Hair", price: 900, stock_qty: 25 });
    expect(row).toEqual({ name: "Shampoo", cat: "Hair", price: 900, stock: 25 });
  });
});
