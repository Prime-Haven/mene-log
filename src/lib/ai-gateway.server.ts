import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const GEMINI_MODEL = "gemini-3.1-flash-lite";

export function createLovableAiGatewayProvider(apiKey?: string) {
  const lovableKey = apiKey || process.env["LOVABLE_API_KEY"];
  if (lovableKey) {
    return createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
  }

  const geminiKey = process.env["GEMINI_API_KEY"] || "";
  return createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: geminiKey,
  });
}

