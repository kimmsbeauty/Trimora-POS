// supabase/functions/ai-classify-question/index.ts
//
// Classifies a free-text question typed into "Ask Trimora" into a
// structured capability + date range, using Gemini's free tier.
//
// DESIGN CONSTRAINT (do not weaken this): this function only ever
// receives the raw question text typed by the salon owner. It never
// sees, requests, or forwards any salon revenue, customer, or sales
// data -- there is no Supabase client in this function at all. All
// actual data fetching and computation still happens entirely inside
// AIService, against the salon's own tenant-scoped data, exactly as
// before this function existed. This function's only job is turning
// open-ended phrasing into a capability name Local Intelligence
// already knows how to compute.
//
// If this function is unavailable, misconfigured, errors, or times
// out, the caller (AskTrimora.jsx) falls back to its own local
// keyword classifier -- Ask Trimora never breaks because of this.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CAPABILITIES = ["revenue", "customers", "topItems", "unsupported"];
const RANGES = ["today", "week", "month", "yesterday"];

const SYSTEM_PROMPT = `You are a strict classifier for a salon POS "Ask" box. Given a
question typed by a salon owner, output ONLY a JSON object (no markdown, no
prose, no explanation) with exactly this shape:
{"capability": "revenue" | "customers" | "topItems" | "unsupported", "range": "today" | "week" | "month" | "yesterday"}

Rules:
- "revenue": questions about money made, income, takings, sales totals, how the business is doing financially.
- "customers": questions about how many people/clients visited, new customers, walk-ins.
- "topItems": questions about best-selling products or services, what's popular.
- "unsupported": anything else -- staff/stylist performance, bookings/appointments, stock/inventory levels, reviews/feedback, or anything unrelated to a salon's own sales, customer, or item data.
- "range" defaults to "today" if no time period is mentioned or implied.
Output valid JSON only, nothing else.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return new Response(
        JSON.stringify({ error: "question is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      // Not configured yet -- caller falls back to local classification.
      return new Response(
        JSON.stringify({ error: "AI classification not configured" }),
        { status: 503, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Auth via header, not the older ?key= query param: Google's newer
    // "Auth key" format (keys starting with "AQ.", issued going forward
    // from mid-2026) requires x-goog-api-key -- the header form also
    // works with older "AIzaSy..." keys, so this is the more compatible
    // choice either way.
    let geminiRes;
    try {
      geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: question }] }],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[ai-classify-question] Gemini API error:", geminiRes.status, errText);
      return new Response(
        JSON.stringify({ error: "classification failed" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const text = geminiData && geminiData.candidates && geminiData.candidates[0] &&
      geminiData.candidates[0].content && geminiData.candidates[0].content.parts &&
      geminiData.candidates[0].content.parts[0] && geminiData.candidates[0].content.parts[0].text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      console.error("[ai-classify-question] Could not parse Gemini output:", text);
      return new Response(
        JSON.stringify({ error: "could not parse classification" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const capability = CAPABILITIES.includes(parsed.capability) ? parsed.capability : "unsupported";
    const range = RANGES.includes(parsed.range) ? parsed.range : "today";

    return new Response(
      JSON.stringify({ capability: capability, range: range }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    var isAbort = e && e.name === "AbortError";
    console.error("[ai-classify-question] Unexpected error:", isAbort ? "timeout" : e);
    return new Response(
      JSON.stringify({ error: isAbort ? "classification timed out" : "unexpected error" }),
      { status: isAbort ? 504 : 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
