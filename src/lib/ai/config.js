// src/lib/ai/config.js
//
// Single source of truth for which AI provider is active. Per the TIP
// design: switching providers must be a config change only, never a
// change to business logic or to any code that calls AIService.
//
// Local Intelligence (SQL/business rules, no external calls, no cost)
// is the default and, for now, the ONLY enabled provider. The paid
// providers are registered below so ProviderManager knows they exist,
// but they stay disabled until this file is deliberately changed.

export const AI_PROVIDER = "local";

export const PROVIDER_STATUS = {
  local: "enabled",
  anthropic: "disabled",
  openai: "disabled",
  gemini: "disabled",
  ollama: "disabled",
};
