// src/lib/ai/providers/GeminiProvider.js
//
// Real implementation, but deliberately scoped to ONE thing: question
// classification via the ai-classify-question Edge Function (which
// holds the Gemini API key server-side -- it never touches the client
// bundle). This file intentionally does NOT implement
// summarizeRevenue/summarizeCustomers/summarizeTopItems -- those stay
// on LocalIntelligenceProvider. That's not a TODO, it's the point: no
// salon business data should ever reach this provider, and refusing
// to implement those methods makes that true at the code level, not
// just by convention.
//
// If GEMINI_API_KEY isn't configured on Supabase yet, or the request
// fails or times out, this throws -- AIService.classifyQuestion()
// catches that and falls back to LocalIntelligenceProvider.classifyQuestion
// automatically, so Ask Trimora never breaks because of this provider.

import { SUPABASE_URL, SUPABASE_KEY } from "../../constants";

async function classifyQuestion(question) {
  var res = await fetch(SUPABASE_URL + "/functions/v1/ai-classify-question", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
    },
    body: JSON.stringify({ question: question }),
  });

  if (!res.ok) {
    throw new Error("[GeminiProvider] classification request failed with status " + res.status);
  }

  var data = await res.json();
  if (!data || !data.capability) {
    throw new Error("[GeminiProvider] classification response was malformed");
  }

  return { capability: data.capability, range: data.range || "today" };
}

function refuseSummarization(methodName) {
  return function () {
    throw new Error(
      "[AIService] Provider 'gemini' does not implement '" + methodName + "' -- " +
      "this is by design, not a missing feature. Summarization of real business " +
      "data must stay on Local Intelligence. If you need Gemini (or any external " +
      "provider) to summarize data, that requires a deliberate, separate decision " +
      "-- do not route AI_PROVIDER to 'gemini' to work around this."
    );
  };
}

export default {
  name: "gemini",
  classifyQuestion: classifyQuestion,
  summarizeRevenue: refuseSummarization("summarizeRevenue"),
  summarizeCustomers: refuseSummarization("summarizeCustomers"),
  summarizeTopItems: refuseSummarization("summarizeTopItems"),
};
