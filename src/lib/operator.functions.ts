import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  admin, audit, findOperator, hashPassword, listOperatorUsers, normaliseUsername,
  operatorEmail, rateLimit, validOperatorPassword, verifyPassword,
} from "./operator.server";

const GENERIC = "Username or password is incorrect.";

/* ---------------- Sign in with username + password ---------------- */
export const operatorSignIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(72) }).parse(d))
  .handler(async ({ data }) => {
    const username = normaliseUsername(data.username);
    const ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
    const okUser = await rateLimit("operator_login_user", username, 5, 900);
    const okIp = await rateLimit("operator_login_ip", ip, 5, 900);
    if (!okUser || !okIp) return { ok: false as const, error: "Too many attempts. Wait 15 minutes and try again." };

    const operator = await findOperator(username);
    const valid = verifyPassword(data.password, operator?.app_metadata.operator_hash);
    if (!operator || !valid) {
      if (operator) await audit(operator.id, "operator.sign_in_failed", { ip });
      return { ok: false as const, error: GENERIC };
    }
    const db = await admin();
    const { data: isAdmin } = await db.from("platform_admins").select("user_id").eq("user_id", operator.id).maybeSingle();
    if (!isAdmin) return { ok: false as const, error: GENERIC };

    const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: "magiclink", email: operator.email });
    if (linkError || !link?.properties?.hashed_token) return { ok: false as const, error: "Sign-in is unavailable right now. Try again shortly." };
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const pub = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); } },
    });
    const { data: verified, error: otpError } = await pub.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (otpError || !verified.session) return { ok: false as const, error: "Sign-in is unavailable right now. Try again shortly." };
    await audit(operator.id, "operator.sign_in", { ip });
    return { ok: true as const, access_token: verified.session.access_token, refresh_token: verified.session.refresh_token };
  });

/* ---------------- Guard ---------------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("Prime Haven operator access with two-step sign-in is required.");
}

// Estimated bytes per row, used to size each church's share of the database.
const ROW_BYTES = { members: 1200, attendance: 260, messages: 1400, services: 300, audit_events: 500, tenant_users: 250, leader_profiles: 700, member_followups: 400, ask_mene_messages: 1500 } as const;

/* ---------------- Full console snapshot (aggregate only) ---------------- */
export const consoleSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context);
    const db = await admin();
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

    const [{ data: tenants }, { data: subs }, { data: payments }, { data: space }, { data: auditRows }, { data: msgs }] = await Promise.all([
      db.from("tenants").select("id,name,subdomain,tier,status,approval_status,trial_ends_at,contact_email,contact_phone,created_at,extra_member_slots,admin_notes,require_mfa,logo_path").order("created_at", { ascending: false }).limit(1000),
      db.from("subscriptions").select("tenant_id,tier,period_start,period_end,auto_renew,payment_method"),
      db.from("payments").select("id,tenant_id,reference,amount_kobo,currency,tier,status,channel,paid_at,created_at").order("created_at", { ascending: false }).limit(3000),
      db.from("space_requests").select("id,tenant_id,extra_slots,amount_cents,status,created_at").order("created_at", { ascending: false }).limit(500),
      db.from("platform_audit_events").select("id,actor_user_id,action,tenant_id,detail,created_at").order("created_at", { ascending: false }).limit(1000),
      db.from("messages").select("tenant_id,channel,status,created_at").gte("created_at", since30).limit(50000),
    ]);

    type TenantRow = { id: string; name: string; subdomain: string; tier: string; status: string; approval_status: string; trial_ends_at: string | null; contact_email: string | null; contact_phone: string | null; created_at: string; extra_member_slots: number; admin_notes: string | null; require_mfa: boolean; logo_path: string | null };
    const tenantList = (tenants ?? []) as TenantRow[];
    const count = async (table: string, tenantId: string, extra?: (q: any) => any) => {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if (extra) q = extra(q);
      const { count: c } = await q;
      return c ?? 0;
    };

    const perTenant = await Promise.all(tenantList.map(async (t) => {
      const [members, attendance, attendance30, services, staff, messages, audits, leaders, followups, ai, lastAtt] = await Promise.all([
        count("members", t.id, (q) => q.neq("status", "anonymised")),
        count("attendance", t.id),
        count("attendance", t.id, (q) => q.gte("recorded_at", since30)),
        count("services", t.id),
        count("tenant_users", t.id, (q) => q.eq("status", "active")),
        count("messages", t.id),
        count("audit_events", t.id),
        count("leader_profiles", t.id),
        count("member_followups", t.id),
        count("ask_mene_messages", t.id),
        db.from("attendance").select("recorded_at").eq("tenant_id", t.id).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const bytes = members * ROW_BYTES.members + attendance * ROW_BYTES.attendance + messages * ROW_BYTES.messages + services * ROW_BYTES.services + audits * ROW_BYTES.audit_events + staff * ROW_BYTES.tenant_users + leaders * ROW_BYTES.leader_profiles + followups * ROW_BYTES.member_followups + ai * ROW_BYTES.ask_mene_messages + 4096;
      return { id: t.id as string, members, attendance, attendance30, services, staff, messages, leaders, rows: members + attendance + messages + services + audits + staff + leaders + followups + ai, bytes, last_activity: (lastAtt.data?.recorded_at as string | undefined) ?? null };
    }));

    // Storage buckets: sum file sizes (two folder levels deep).
    const storage: Array<{ bucket: string; files: number; bytes: number }> = [];
    const tenantStorage: Record<string, number> = {};
    try {
      const { data: buckets } = await db.storage.listBuckets();
      for (const b of buckets ?? []) {
        let files = 0, bytes = 0;
        const { data: top } = await db.storage.from(b.name).list("", { limit: 1000 });
        for (const item of top ?? []) {
          if (item.id) { files++; bytes += item.metadata?.size ?? 0; continue; }
          const { data: inner } = await db.storage.from(b.name).list(item.name, { limit: 1000 });
          for (const f of inner ?? []) {
            if (!f.id) continue;
            files++; const s = f.metadata?.size ?? 0; bytes += s;
            if (tenantList.some((t) => t.id === item.name)) tenantStorage[item.name] = (tenantStorage[item.name] ?? 0) + s;
          }
        }
        storage.push({ bucket: b.name, files, bytes });
      }
    } catch { /* storage listing is best effort */ }

    // Weekly check-ins across the platform (12 weeks).
    const weekly = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
      const end = new Date(Date.now() - i * 7 * 864e5); const start = new Date(end.getTime() - 7 * 864e5);
      const { count: c } = await db.from("attendance").select("id", { count: "exact", head: true }).gte("recorded_at", start.toISOString()).lt("recorded_at", end.toISOString());
      return { week: start.toISOString().slice(0, 10), checkins: c ?? 0 };
    }));

    const msgHealth: Record<string, { email_sent: number; sms_sent: number; failed: number; queued: number }> = {};
    for (const m of (msgs ?? []) as any[]) {
      const row = (msgHealth[m.tenant_id!] ??= { email_sent: 0, sms_sent: 0, failed: 0, queued: 0 });
      if (m.status === "sent") row[m.channel === "sms" ? "sms_sent" : "email_sent"]++;
      else if (m.status === "failed") row.failed++;
      else row.queued++;
    }

    const operators = await listOperatorUsers();
    const opName = Object.fromEntries(operators.map((o) => [o.id, o.app_metadata.operator_username ?? o.email]));

    const env = (k: string) => !!process.env[k];
    const day = new Date(Date.now() - 864e5).toISOString();
    const hourAgo = new Date(Date.now() - 36e5).toISOString();
    const [{ count: sent24 }, { count: failed24 }, { count: stuck }] = await Promise.all([
      db.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", day),
      db.from("messages").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", day),
      db.from("messages").select("id", { count: "exact", head: true }).eq("status", "queued").lt("scheduled_at", hourAgo),
    ]);
    const lastPaid = ((payments ?? []) as any[]).find((p) => p.status === "success");

    return {
      generated_at: new Date().toISOString(),
      tenants: tenantList.map((t) => ({ ...t, sub: ((subs ?? []) as Array<{ tenant_id: string; period_end: string; auto_renew: boolean; payment_method: string }>).find((s) => s.tenant_id === t.id) ?? null, usage: perTenant.find((p) => p.id === t.id) as { members: number; attendance: number; attendance30: number; services: number; staff: number; messages: number; leaders: number; rows: number; bytes: number; last_activity: string | null }, storage_bytes: tenantStorage[t.id] ?? 0, messaging: msgHealth[t.id] ?? { email_sent: 0, sms_sent: 0, failed: 0, queued: 0 } })),
      payments: (payments ?? []) as Array<{ id: string; tenant_id: string; reference: string; amount_kobo: number; currency: string; tier: string; status: string; channel: string | null; paid_at: string | null; created_at: string }>,
      space_requests: (space ?? []) as Array<{ id: string; tenant_id: string; extra_slots: number; amount_cents: number; status: string; created_at: string }>,
      audit: ((auditRows ?? []) as Array<{ id: string; actor_user_id: string; action: string; tenant_id: string | null; detail: unknown; created_at: string }>).map((a) => ({ ...a, actor: (opName[a.actor_user_id] ?? "operator") as string })),
      weekly: weekly.reverse(),
      storage,
      operators: operators.map((o) => ({ id: o.id, username: o.app_metadata.operator_username ?? o.email, last_sign_in_at: o.last_sign_in_at, created_at: o.created_at, is_me: o.id === context.userId })),
      health: {
        email: env("MENELOG_RESEND_API_KEY"), payments: env("PAYSTACK_SECRET_KEY"), cron: env("MENELOG_CRON_SECRET"), ai: env("LOVABLE_API_KEY"),
        sms: env("AKASEL_API_KEY") || env("AKASEL_API_TOKEN"),
        sent_24h: sent24 ?? 0, failed_24h: failed24 ?? 0, stuck_queue: stuck ?? 0, last_payment_at: lastPaid?.paid_at ?? lastPaid?.created_at ?? null,
      },
    };
  });

/* ---------------- Mutations ---------------- */
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("extend"), tenant_id: z.string().uuid(), days: z.number().int().min(1).max(730) }),
  z.object({ type: z.literal("notes"), tenant_id: z.string().uuid(), notes: z.string().max(4000) }),
  z.object({ type: z.literal("require_mfa"), tenant_id: z.string().uuid(), value: z.boolean() }),
  z.object({ type: z.literal("retry_failed"), tenant_id: z.string().uuid().nullable() }),
  z.object({ type: z.literal("resend_welcome"), tenant_id: z.string().uuid() }),
  z.object({ type: z.literal("announce"), subject: z.string().min(3).max(150), body: z.string().min(5).max(5000), tiers: z.array(z.enum(["free", "basic", "standard", "premium"])).min(1), statuses: z.array(z.enum(["active", "grace", "suspended", "closed"])).min(1) }),
  z.object({ type: z.literal("add_operator"), username: z.string().regex(/^[a-z0-9._-]{3,30}$/i), password: z.string() }),
  z.object({ type: z.literal("remove_operator"), user_id: z.string().uuid() }),
  z.object({ type: z.literal("reset_operator"), user_id: z.string().uuid(), password: z.string() }),
  z.object({ type: z.literal("change_password"), current: z.string(), next: z.string() }),
]);

export type OperatorActionInput = z.infer<typeof action>;

export const operatorAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => action.parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context);
    if (!(await rateLimit("operator_action", context.userId, 60, 300))) throw new Error("Too many actions in a short time. Wait a few minutes.");
    const db = await admin();
    const me = context.userId;

    switch (data.type) {
      case "extend": {
        const { data: t } = await db.from("tenants").select("trial_ends_at,name").eq("id", data.tenant_id).single();
        const { data: s } = await db.from("subscriptions").select("period_end").eq("tenant_id", data.tenant_id).maybeSingle();
        const add = (iso: string | null) => { const base = iso && new Date(iso) > new Date() ? new Date(iso) : new Date(); return new Date(base.getTime() + data.days * 864e5); };
        if (s) {
          if (String(s.period_end).startsWith("9999")) throw new Error("Free plan churches never expire.");
          await db.from("subscriptions").update({ period_end: add(s.period_end).toISOString().slice(0, 10) }).eq("tenant_id", data.tenant_id);
        }
        if (t?.trial_ends_at) await db.from("tenants").update({ trial_ends_at: add(t.trial_ends_at).toISOString() }).eq("id", data.tenant_id);
        await db.from("tenants").update({ status: "active" }).eq("id", data.tenant_id).eq("status", "grace");
        await audit(me, "tenant.extended", { days: data.days }, data.tenant_id);
        return { ok: true, message: `Extended by ${data.days} days` };
      }
      case "notes":
        await db.from("tenants").update({ admin_notes: data.notes }).eq("id", data.tenant_id);
        await audit(me, "tenant.notes_updated", {}, data.tenant_id);
        return { ok: true, message: "Notes saved" };
      case "require_mfa":
        await db.from("tenants").update({ require_mfa: data.value }).eq("id", data.tenant_id);
        await audit(me, "tenant.require_mfa", { value: data.value }, data.tenant_id);
        return { ok: true, message: data.value ? "Two-step sign-in required" : "Two-step sign-in requirement removed" };
      case "retry_failed": {
        let q = db.from("messages").update({ status: "queued", attempts: 0, error: null, scheduled_at: new Date().toISOString() }).eq("status", "failed");
        if (data.tenant_id) q = q.eq("tenant_id", data.tenant_id);
        const { data: rows } = await q.select("id");
        await audit(me, "messages.retried", { count: rows?.length ?? 0 }, data.tenant_id);
        return { ok: true, message: `${rows?.length ?? 0} messages queued again` };
      }
      case "resend_welcome": {
        const { data: t } = await db.from("tenants").select("name,contact_email,brand_primary,subdomain").eq("id", data.tenant_id).single();
        if (!t?.contact_email) throw new Error("This church has no contact email.");
        const { renderEmail, sendEmail } = await import("./messaging.server");
        const { SITE_URL } = await import("./site");
        const res = await sendEmail({ to: t.contact_email, fromName: "Mene:Log", replyTo: null, subject: `Welcome to Mene:Log, ${t.name}`,
          html: renderEmail({ churchName: t.name, brandPrimary: t.brand_primary, logoUrl: null, subject: `Welcome to Mene:Log`, body: `Your church account is ready.\n\nSign in to set up services, members and check-in. Your check-in page is ${SITE_URL}/c/${t.subdomain}.`, ctaLabel: "Sign in", ctaUrl: `${SITE_URL}/auth` }) });
        if (!res.ok) throw new Error(res.error ?? "Email failed");
        await audit(me, "tenant.welcome_resent", {}, data.tenant_id);
        return { ok: true, message: "Welcome email sent" };
      }
      case "announce": {
        const { data: ts } = await db.from("tenants").select("id,name,brand_primary").in("tier", data.tiers).in("status", data.statuses);
        const ids = (ts ?? []).map((t: any) => t.id);
        if (!ids.length) throw new Error("No churches match this audience.");
        const { data: owners } = await db.from("tenant_users").select("tenant_id,user_id").in("tenant_id", ids).in("role", ["owner", "church_admin"]).eq("status", "active");
        const userIds = [...new Set((owners ?? []).map((o: any) => o.user_id))];
        const { data: profiles } = userIds.length ? await db.from("profiles").select("id,email").in("id", userIds) : { data: [] };
        const emails = [...new Set((profiles ?? []).map((p: any) => p.email).filter(Boolean))] as string[];
        const { renderEmail, sendEmail } = await import("./messaging.server");
        const html = renderEmail({ churchName: "Prime Haven · Mene:Log", brandPrimary: "#3b82f6", logoUrl: null, subject: data.subject, body: data.body });
        let sent = 0;
        for (const to of emails.slice(0, 2000)) { const r = await sendEmail({ to, subject: data.subject, html, fromName: "Mene:Log", replyTo: null }); if (r.ok) sent++; }
        await audit(me, "announcement.sent", { subject: data.subject, body: data.body, tiers: data.tiers, statuses: data.statuses, recipients: emails.length, sent });
        return { ok: true, message: `Announcement sent to ${sent} of ${emails.length} administrators` };
      }
      case "add_operator": {
        if (!validOperatorPassword(data.password)) throw new Error("Password must be 8 to 72 characters.");
        const username = normaliseUsername(data.username);
        if (await findOperator(username)) throw new Error("That username is already taken.");
        const { data: created, error } = await db.auth.admin.createUser({ email: operatorEmail(username), password: crypto.randomUUID() + "Aa1!", email_confirm: true, app_metadata: { operator: true, operator_username: username, operator_hash: hashPassword(data.password) } });
        if (error || !created.user) throw new Error("Could not create operator");
        await db.from("platform_admins").insert({ user_id: created.user.id });
        await audit(me, "operator.added", { username });
        return { ok: true, message: `Operator ${username} added` };
      }
      case "remove_operator": {
        if (data.user_id === me) throw new Error("You can't remove your own account.");
        const ops = await listOperatorUsers();
        const target = ops.find((o) => o.id === data.user_id);
        if (!target) throw new Error("Operator not found");
        if (ops.length <= 1) throw new Error("At least one operator must remain.");
        await db.from("platform_admins").delete().eq("user_id", data.user_id);
        await db.auth.admin.deleteUser(data.user_id);
        await audit(me, "operator.removed", { username: target.app_metadata.operator_username });
        return { ok: true, message: "Operator removed" };
      }
      case "reset_operator": {
        if (!validOperatorPassword(data.password)) throw new Error("Password must be 8 to 72 characters.");
        const target = (await listOperatorUsers()).find((o) => o.id === data.user_id);
        if (!target) throw new Error("Operator not found");
        await db.auth.admin.updateUserById(data.user_id, { app_metadata: { ...target.app_metadata, operator_hash: hashPassword(data.password) } });
        await audit(me, "operator.password_reset", { username: target.app_metadata.operator_username });
        return { ok: true, message: "Password reset" };
      }
      case "change_password": {
        if (!validOperatorPassword(data.next)) throw new Error("New password must be 8 to 72 characters.");
        const self = (await listOperatorUsers()).find((o) => o.id === me);
        if (!self || !verifyPassword(data.current, self.app_metadata.operator_hash)) throw new Error("Current password is incorrect.");
        await db.auth.admin.updateUserById(me, { app_metadata: { ...self.app_metadata, operator_hash: hashPassword(data.next) } });
        await audit(me, "operator.password_changed");
        return { ok: true, message: "Password changed" };
      }
    }
  });
