// src/lib/ai/providers/OpenAIProvider.js
//
// Registered per the TIP architecture, disabled until explicitly
// turned on in config.js. Swap the body of this file for a real
// implementation when the business decides to enable OpenAI -- no
// caller of AIService needs to change when that happens.

import { createDisabledProvider } from "./disabledProvider";

export default createDisabledProvider("openai");
