import GeminiProvider from "./GeminiProvider";

describe("GeminiProvider.classifyQuestion", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test("calls the ai-classify-question edge function with the question text", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ capability: "revenue", range: "week" }),
    });

    var result = await GeminiProvider.classifyQuestion("how much did we make this week?");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    var callArgs = global.fetch.mock.calls[0];
    expect(callArgs[0]).toMatch(/\/functions\/v1\/ai-classify-question$/);
    var body = JSON.parse(callArgs[1].body);
    expect(body).toEqual({ question: "how much did we make this week?" });
    expect(result).toEqual({ capability: "revenue", range: "week" });
  });

  test("defaults range to today if the response omits it", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ capability: "customers" }),
    });
    var result = await GeminiProvider.classifyQuestion("how many customers today?");
    expect(result.range).toBe("today");
  });

  test("throws if the edge function responds with a non-OK status (e.g. not configured yet)", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(GeminiProvider.classifyQuestion("anything")).rejects.toThrow();
  });

  test("throws if the response is missing a capability field", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await expect(GeminiProvider.classifyQuestion("anything")).rejects.toThrow();
  });

  test("throws (does not silently resolve) if the network call itself fails", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));
    await expect(GeminiProvider.classifyQuestion("anything")).rejects.toThrow("network down");
  });
});

describe("GeminiProvider summarization methods (must not be implemented)", () => {
  test("summarizeRevenue refuses rather than silently no-opping", () => {
    expect(() => GeminiProvider.summarizeRevenue([], {})).toThrow();
  });
  test("summarizeCustomers refuses rather than silently no-opping", () => {
    expect(() => GeminiProvider.summarizeCustomers([], [], {})).toThrow();
  });
  test("summarizeTopItems refuses rather than silently no-opping", () => {
    expect(() => GeminiProvider.summarizeTopItems([], {})).toThrow();
  });
});
