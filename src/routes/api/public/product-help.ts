import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { streamText } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const Input = z.object({ question: z.string().trim().min(2).max(500) });

function publishableClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Data service is unavailable");
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

export const Route = createFileRoute("/api/public/product-help")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = Input.safeParse(await request.json());
          if (!input.success) return Response.json({ error: "Ask one question of up to 500 characters." }, { status: 400 });

          // Only trust the edge-set header; client-supplied x-forwarded-for is spoofable.
          const forwarded = request.headers.get("cf-connecting-ip") ?? "unknown";
          const identifier = createHash("sha256").update(forwarded.trim()).digest("hex");
          const client = publishableClient();
          const { data: allowed, error: limitError } = await client.rpc("public_help_allow_request", { p_identifier: identifier });
          if (limitError) return Response.json({ error: "Mene:Log help is unavailable right now." }, { status: 503 });
          if (!allowed) return Response.json({ error: "The hourly question limit has been reached. Please try later." }, { status: 429 });

          const apiKey = process.env["LOVABLE_API_KEY"];
          if (!apiKey) return Response.json({ error: "Mene:Log help is not configured yet." }, { status: 503 });
          const lovable = createOpenAI({
            baseURL: "https://ai.gateway.lovable.dev/v1",
            apiKey,
            headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          });
          const result = streamText({
            model: lovable.responses("openai/gpt-6-astra"),
            system: "You are Mene:Log product help. Answer only questions about the Mene:Log church attendance platform. It offers QR attendance, membership records, services, reports, church branding, email, leader access on Standard, and branches/SMS/automation on Premium. Plans are Basic $10, Standard $25, Premium $50 monthly (yearly saves 20%), with a 14-day trial. Permanent check-in links use menelog.site/c/name. Never claim access to a church's data, never request personal member information, and never answer unrelated questions. Be concise and practical.",
            prompt: input.data.question,
            providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
          });
          const answer = (await result.text).trim();
          return Response.json({ answer: answer || "I could not produce an answer for that question." });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Mene:Log help is temporarily unavailable.";
          console.error("[product-help] request failed", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});