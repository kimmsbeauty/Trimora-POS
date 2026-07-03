// src/lib/ai/ProviderManager.js
//
// Resolves which provider implementation is active, based on
// src/lib/ai/config.js. This is the one place in TIP that imports
// every provider -- AIService never imports a provider directly, and
// no page/component ever imports this file directly either.

import { AI_PROVIDER } from "./config";
import LocalIntelligenceProvider from "./providers/LocalIntelligenceProvider";
import AnthropicProvider from "./providers/AnthropicProvider";
import OpenAIProvider from "./providers/OpenAIProvider";
import GeminiProvider from "./providers/GeminiProvider";
import OllamaProvider from "./providers/OllamaProvider";

var PROVIDERS = {
  local: LocalIntelligenceProvider,
  anthropic: AnthropicProvider,
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  ollama: OllamaProvider,
};

export function getActiveProvider() {
  var provider = PROVIDERS[AI_PROVIDER];
  if (!provider) {
    throw new Error("[AIService] Unknown AI_PROVIDER '" + AI_PROVIDER + "' in config.js");
  }
  return provider;
}

export function getProvider(name) {
  var provider = PROVIDERS[name];
  if (!provider) {
    throw new Error("[AIService] Unknown provider '" + name + "'");
  }
  return provider;
}
