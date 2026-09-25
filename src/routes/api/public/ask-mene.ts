import { createFileRoute } from "@tanstack/react-router";
import { streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, GEMINI_MODEL } from "@/lib/ai-gateway.server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

const textOf = (message: UIMessage) =>
  message.parts.filter((part) => part.type === "text").map((part) => part.text).join("").trim();

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Data service is unavailable");
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/public/ask-mene")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
          if (!token) return Response.json({ error: "Sign in again to continue." }, { status: 401 });

          const client = userClient(token);
          const { data: claims } = await client.auth.getClaims(token);
          if (!claims?.claims?.sub) return Response.json({ error: "Your session has expired." }, { status: 401 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const body = (await request.json()) as { tenantId?: string; messages?: UIMessage[] };
          const tenantId = body.tenantId?.trim() ?? "";

          // Premium churches get the fuller assistant: longer memory, longer
          // questions and deeper answers. The switch lives in plan_config.
          const { data: tenantRow } = tenantId
            ? await supabaseAdmin.from("tenants").select("tier").eq("id", tenantId).single()
            : { data: null };
          const { data: planRows } = await supabaseAdmin.from("plan_config").select("tier, config");
          const planConfig = Object.fromEntries(
            (planRows ?? []).map((r) => [r.tier, r.config as Record<string, boolean | number>]),
          );
          const tier = (tenantRow?.tier ?? "free") as string;
          const pro = planConfig[tier]?.["ask_mene_pro"] === true;

          const messages = Array.isArray(body.messages) ? body.messages.slice(pro ? -40 : -16) : [];
          const latest = [...messages].reverse().find((message) => message.role === "user");
          const question = latest ? textOf(latest) : "";
          const maxQuestion = pro ? 2000 : 800;
          if (!tenantId || !question || question.length > maxQuestion) {
            return Response.json({ error: `Ask one question of up to ${maxQuestion} characters.` }, { status: 400 });
          }

          const { data: allowed, error: limitError } = await client.rpc("ask_mene_allow_request", { p_tenant: tenantId });
          if (limitError) return Response.json({ error: "You do not have access to Ask Mene." }, { status: 403 });
          if (!allowed) return Response.json({ error: "Ask Mene's hourly limit has been reached. Try again later." }, { status: 429 });

          const { data: context, error: contextError } = await client.rpc("ask_mene_context", { p_tenant: tenantId });
          if (contextError || !context) return Response.json({ error: "Church insights are unavailable right now." }, { status: 403 });

          const apiKey = process.env["LOVABLE_API_KEY"];
          if (!apiKey) return Response.json({ error: "Ask Mene is not configured yet." }, { status: 503 });

          const { data: conversation, error: conversationError } = await supabaseAdmin
            .from("ask_mene_conversations")
            .upsert({ tenant_id: tenantId, updated_by: claims.claims.sub }, { onConflict: "tenant_id" })
            .select("id")
            .single();
          if (conversationError) throw conversationError;

          await supabaseAdmin.from("ask_mene_messages").insert({
            conversation_id: conversation.id,
            tenant_id: tenantId,
            role: "user",
            content: question,
            created_by: claims.claims.sub,
          });

          const gateway = createLovableAiGatewayProvider(apiKey);
          const system = pro
            ? `You are Ask Mene:Log Pro, a thorough church operations analyst. Answer only from the aggregate JSON snapshot below. Never infer or request names, contacts, dates of birth, QR data, or individual records. Give a fuller analysis: start with a one-line headline, then structured sections with exact figures, week-on-week trends, and 2-3 concrete recommended actions. If the snapshot cannot answer, say so plainly.\n\nAGGREGATE CHURCH SNAPSHOT:\n${JSON.stringify(context)}`
            : `You are Ask Mene:Log, a concise church operations analyst. Answer only from the aggregate JSON snapshot below. Never infer or request names, contacts, dates of birth, QR data, or individual records. If the snapshot cannot answer, say so plainly. Prefer 2-5 short bullets, include exact dates/counts when relevant, and identify trends without overstating causality.\n\nAGGREGATE CHURCH SNAPSHOT:\n${JSON.stringify(context)}`;
          const result = streamText({
            model: gateway(GEMINI_MODEL),
            system,
            // Conversation roles are server-owned. The client may submit UI
            // history for rendering, but only the latest validated user text
            // is sent to the model.
            messages: [{ role: "user", content: question }],
            maxOutputTokens: pro ? 1600 : 700,
          });

          void supabaseAdmin.from("audit_events").insert({
            tenant_id: tenantId,
            actor_user_id: claims.claims.sub,
            action: "ask_mene.asked",
            target: conversation.id,
            detail: { question_length: question.length } as Json,
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            sendReasoning: false,
            onError: () => "Ask Mene:Log could not complete that answer. Please try again.",
            onFinish: async ({ responseMessage, isAborted }) => {
              if (isAborted) return;
              const answer = textOf(responseMessage).slice(0, 12000);
              if (!answer) return;
              await supabaseAdmin.from("ask_mene_messages").insert({
                conversation_id: conversation.id,
                tenant_id: tenantId,
                role: "assistant",
                content: answer,
                created_by: claims.claims.sub,
              });
              await supabaseAdmin.from("ask_mene_conversations").update({ updated_at: new Date().toISOString(), updated_by: claims.claims.sub }).eq("id", conversation.id);
            },
          });
        } catch (error) {
          console.error("[ask-mene] request failed", error instanceof Error ? error.message : error);
          return Response.json({ error: "Ask Mene:Log is temporarily unavailable. Please try again." }, { status: 500 });
        }
      },
    },
  },
});