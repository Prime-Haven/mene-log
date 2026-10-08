import { createFileRoute } from "@tanstack/react-router";
import { streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, GEMINI_MODEL } from "@/lib/ai-gateway.server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

const textOf = (message: UIMessage) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

function userClient(token: string) {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    "https://pmkimlbvdzgduxgxucsx.supabase.co";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    "sb_publishable_UWtwnrZyj1q_4jHqR4517w_yt1pXFUQ";
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
          if (!token)
            return Response.json({ error: "Sign in again to continue." }, { status: 401 });

          const client = userClient(token);
          const { data: claims } = await client.auth.getClaims(token);
          if (!claims?.claims?.sub)
            return Response.json({ error: "Your session has expired." }, { status: 401 });

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
            return Response.json(
              { error: `Ask one question of up to ${maxQuestion} characters.` },
              { status: 400 },
            );
          }

          const { data: allowed, error: limitError } = await client.rpc("ask_mene_allow_request", {
            p_tenant: tenantId,
          });
          if (limitError)
            return Response.json({ error: "You do not have access to Ask Mene." }, { status: 403 });
          if (!allowed)
            return Response.json(
              { error: "Ask Mene's hourly limit has been reached. Try again later." },
              { status: 429 },
            );

          const { data: context, error: contextError } = await client.rpc("ask_mene_context", {
            p_tenant: tenantId,
          });
          if (contextError || !context)
            return Response.json(
              { error: "Church insights are unavailable right now." },
              { status: 403 },
            );

          const apiKey = process.env["LOVABLE_API_KEY"] || process.env["GEMINI_API_KEY"];
          if (!apiKey)
            return Response.json({ error: "Ask Mene is not configured yet." }, { status: 503 });

          // Fetch rich live church context: services, attendee rosters, and members
          const { data: churchTenant } = await supabaseAdmin
            .from("tenants")
            .select("id, name, subdomain, tier, contact_email, contact_phone, created_at, parent_tenant_id")
            .eq("id", tenantId)
            .maybeSingle();

          const { data: recentServices } = await supabaseAdmin
            .from("services")
            .select("id, name, service_type, starts_at, target_attendance")
            .eq("tenant_id", tenantId)
            .order("starts_at", { ascending: false })
            .limit(10);

          const serviceIds = (recentServices ?? []).map((s) => s.id);
          let attendeesList: Array<{
            service_name: string;
            service_date: string;
            attendee_name: string;
            method: string;
            recorded_at: string;
          }> = [];

          if (serviceIds.length > 0) {
            const { data: attRows } = await supabaseAdmin
              .from("attendance")
              .select(`
                service_id,
                method,
                recorded_at,
                member:members(full_name, phone, gender, is_leader)
              `)
              .in("service_id", serviceIds)
              .order("recorded_at", { ascending: false })
              .limit(150);

            const serviceMap = new Map((recentServices ?? []).map((s) => [s.id, s]));
            attendeesList = (attRows ?? []).map((a) => {
              const svc = serviceMap.get(a.service_id);
              const mem = a.member as unknown as { full_name?: string } | null;
              return {
                service_name: svc?.name || "Church Service",
                service_date: svc?.starts_at ? new Date(svc.starts_at).toLocaleDateString() : "",
                attendee_name: mem?.full_name || "Guest Attendee",
                method: a.method,
                recorded_at: a.recorded_at,
              };
            });
          }

          const { count: memberCount } = await supabaseAdmin
            .from("members")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId);

          const { data: recentMembers } = await supabaseAdmin
            .from("members")
            .select("full_name, joined_on, is_leader")
            .eq("tenant_id", tenantId)
            .order("joined_on", { ascending: false })
            .limit(20);

          const fullChurchContext = {
            church_name: churchTenant?.name || "Your Church",
            church_subdomain: churchTenant?.subdomain || "",
            church_tier: churchTenant?.tier || tier,
            is_branch: !!churchTenant?.parent_tenant_id,
            total_registered_members: memberCount || 0,
            recent_services: recentServices ?? [],
            recent_attendees_sample: attendeesList,
            recent_members: recentMembers ?? [],
            aggregate_snapshot: context ?? null,
          };

          const { data: conversation, error: conversationError } = await supabaseAdmin
            .from("ask_mene_conversations")
            .upsert(
              { tenant_id: tenantId, updated_by: claims.claims.sub },
              { onConflict: "tenant_id" },
            )
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
          const system = `You are Ask Mene (ManyChat AI), the helpful, knowledgeable church operations assistant for "${fullChurchContext.church_name}" on the Mene:Log platform.

CORE RESPONSIBILITIES:
1. CONVERSATIONAL & WELCOMING:
   If the user greets you (e.g. "Hello", "How are you doing?", "Good morning"), respond warmly and conversationally as a helpful church operations assistant. Ask how you can support their ministry, services, or church account today. Do NOT merely dump raw trend numbers.

2. ATTENDANCE & ATTENDEE LOOKUPS:
   The user should be able to ask for attendance details, who came, or who attended recent services.
   Use the REAL church records provided below:
   - Identify the service asked about (or the most recent services).
   - List the names of attendees who checked in, the service title, and check-in count or method (QR badge scan, camera, or manual register).
   - If attendees are recorded in the data, share their names clearly so the user sees who attended.

3. STEP-BY-STEP ACCOUNT & FEATURE GUIDANCE:
   Guide the user step by step when they need help with their Mene:Log church account:
   - QR Check-in & Scanner (/scan): Explain how ushers launch the camera scanner, scan member QR passcards, or use the "Manual Search & Check-in" tab to search by name/phone.
   - Church Services (/services): How to click "New Service" to schedule Sunday gatherings, midweek services, or revival meetings with target attendances.
   - Congregation Members (/members): How to register new members, import via CSV (First Name, Last Name, Phone, Gender), and view or print member QR cards.
   - Attendance Register (/attendance): How to view live registers for any service, toggle attendance markers, and export timestamped CSV files.
   - Member Follow-ups (/followups): How missing-Sunday members (2+ weeks absent) are automatically detected for pastoral visitation and calls.
   - Church Structure & Leaders (/structure, /leaders): How to manage departments and generate leader passcodes.
   - Multi-Campus Branches (/branches): How to set up and monitor branch campuses.
   - Billing & Upgrades (/billing): How to manage the 30-day trial, select monthly/annual plans in GHS or USD via Card/Momo, and download official receipts.
   - Support Desk (/support): How to submit instant support tickets directly to the 24/7 technical operations desk.

4. POLITE OUT-OF-BOUNDS DECLINE:
   You are exclusively an assistant for this church's account and ministry operations on Mene:Log. If the user asks about general topics outside of their church operations, attendance, members, or Mene:Log account (e.g., world politics, unrelated coding, pop culture, random trivia, recipes), politely and warmly decline:
   "I am your dedicated Mene:Log church assistant for ${fullChurchContext.church_name}. I can only assist with your church records, attendance, member care, services, and account operations in Mene:Log. How can I help with your ministry today?"

LIVE CHURCH DATA SNAPSHOT:
${JSON.stringify(fullChurchContext, null, 2)}`;

          const result = streamText({
            model: gateway(GEMINI_MODEL),
            system,
            messages: [{ role: "user", content: question }],
            maxOutputTokens: pro ? 1800 : 900,
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
              await supabaseAdmin
                .from("ask_mene_conversations")
                .update({ updated_at: new Date().toISOString(), updated_by: claims.claims.sub })
                .eq("id", conversation.id);
            },
          });
        } catch (error) {
          console.error(
            "[ask-mene] request failed",
            error instanceof Error ? error.message : error,
          );
          return Response.json(
            { error: "Ask Mene:Log is temporarily unavailable. Please try again." },
            { status: 500 },
          );
        }
      },
    },
  },
});
