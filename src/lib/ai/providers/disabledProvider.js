// src/lib/ai/providers/disabledProvider.js
//
// Factory for the paid-provider stubs. Each real provider file (Anthropic,
// OpenAI, Gemini, Ollama) wraps this so ProviderManager can already see
// all four registered -- matching the TIP architecture -- without any of
// them being reachable until config.js explicitly enables one and a real
// implementation replaces the stub.

export function createDisabledProvider(name) {
  function refuse() {
    throw new Error(
      "[AIService] Provider '" + name + "' is registered but not enabled. " +
      "Enable it in src/lib/ai/config.js and implement its methods before use."
    );
  }

  return {
    name: name,
    summarizeRevenue: refuse,
    summarizeCustomers: refuse,
    summarizeTopItems: refuse,
    classifyQuestion: refuse,
  };
}
