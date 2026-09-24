import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const GEMINI_MODEL = "google/gemini-3.8-flash";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": lovableApiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
}
