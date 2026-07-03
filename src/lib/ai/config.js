// src/lib/ai/config.js
//
// Two independent provider slots, not one, and that split is deliberate:
//
// AI_PROVIDER controls SUMMARIZATION -- the provider that sees real
// salon data (sales, customers, revenue) and computes an answer from
// it. This stays "local" (Local Intelligence: SQL/rules, no external
// calls, no cost) until a paid provider is explicitly enabled AND
// trusted with real business data.
//
// CLASSIFIER_PROVIDER controls QUESTION UNDERSTANDING ONLY -- turning
// a free-text question into a capability name + date range. This
// provider NEVER receives salon data, only the text the owner typed,
// so it's safe to point at Gemini's free tier (which can use free-tier
// prompts for model training) without exposing any business data.
//
// These are separate on purpose: a future change to AI_PROVIDER (e.g.
// enabling paid Anthropic for real summarization) can never accidentally
// widen what CLASSIFIER_PROVIDER is allowed to see, and vice versa.
// GeminiProvider.js enforces this at the code level too -- it doesn't
// implement summarizeRevenue/summarizeCustomers/summarizeTopItems at
// all, so it structurally can't be used for data summarization even
// if AI_PROVIDER were mistakenly set to "gemini".

export const AI_PROVIDER = "local";
export const CLASSIFIER_PROVIDER = "gemini";

export const PROVIDER_STATUS = {
  local: "enabled",
  gemini: "enabled (question classification only -- never summarizes business data)",
  anthropic: "disabled",
  openai: "disabled",
  ollama: "disabled",
};
