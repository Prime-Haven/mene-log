import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  admin,
  audit,
  findOperator,
  hashPassword,
  listOperatorUsers,
  normaliseUsername,
  operatorEmail,
  rateLimit,
  validOperatorPassword,
  verifyPassword,
} from "./operator.server";

const GENERIC = "Username or password is incorrect.";

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

function serializable(value: unknown): SerializableValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) return value.map(serializable);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializable(item)]),
    );
  }
  return String(value ?? "");
}

function serializableRecord(value: unknown): Record<string, SerializableValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serializable(item)]),
  );
}

/* ---------------- Sign in with username + password ---------------- */
export const operatorSignIn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const username = normaliseUsername(data.username);
    const ip = (
      getRequestHeader("cf-connecting-ip") ??
      "unknown"
    )
      .split(",")[0]!
      .trim();
    const okUser = await rateLimit("operator_login_user", username, 5, 900);
    const okIp = await rateLimit("operator_login_ip", ip, 5, 900);
    if (!okUser || !okIp)
      return { ok: false as const, error: "Too many attempts. Wait 15 minutes and try again." };

    const operator = await findOperator(username);
    const valid = verifyPassword(data.password, operator?.app_metadata.operator_hash);
    if (!operator || !valid) {
      if (operator) await audit(operator.id, "operator.sign_in_failed", { ip });
      return { ok: false as const, error: GENERIC };
    }
    const db = await admin();
    const { data: isAdmin } = await db
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", operator.id)
      .maybeSingle();
    if (!isAdmin) return { ok: false as const, error: GENERIC };

    const { data: link, error: linkError } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: operator.email,
    });
    if (linkError || !link?.properties?.hashed_token)
      return { ok: false as const, error: "Sign-in is unavailable right now. Try again shortly." };
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const pub = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: verified, error: otpError } = await pub.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (otpError || !verified.session)
      return { ok: false as const, error: "Sign-in is unavailable right now. Try again shortly." };
    await audit(operator.id, "operator.sign_in", { ip });
    return {
      ok: true as const,
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    };
  });

/* ---------------- Guard ---------------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_platform_admin");
  if (error || data !== true)
    throw new Error("Prime Haven operator access with two-step sign-in is required.");
}

// Estimated bytes per row, used to size each church's share of the database.
const ROW_BYTES = {
  members: 1200,
  attendance: 260,
  messages: 1400,
  services: 300,
  audit_events: 500,
  tenant_users: 250,
  leader_profiles: 700,
  member_followups: 400,
  ask_mene_messages: 1500,
} as const;

/* ---------------- Full console snapshot (aggregate only) ---------------- */
export const consoleSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context);
    const db = await admin();
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

    const [
      { data: tenants },
      { data: subs },
      { data: payments },
      { data: space },
      { data: auditRows },
      { data: msgs },
      { data: backupJobs },
      { count: missingMemberCodes },
      { count: rateLimitCount },
    ] = await Promise.all([
      db
        .from("tenants")
        .select(
          "id,name,subdomain,tier,status,approval_status,approval_risk_flags,approval_reason,correction_requested_at,trial_ends_at,contact_email,contact_phone,created_at,extra_member_slots,admin_notes,require_mfa,logo_path,parent_tenant_id",
        )
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("subscriptions")
        .select("tenant_id,tier,period_start,period_end,auto_renew,payment_method"),
      db
        .from("payments")
        .select(
          "id,tenant_id,reference,amount_kobo,currency,tier,status,channel,paid_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(3000),
      db
        .from("space_requests")
        .select("id,tenant_id,extra_slots,amount_cents,status,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("platform_audit_events")
        .select("id,actor_user_id,actor_username,action,category,severity,tenant_id,tenant_name,detail,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("messages")
        .select("tenant_id,channel,status,error,created_at,scheduled_at,sent_at")
        .gte("created_at", since30)
        .limit(50000),
      db
        .from("tenant_backup_jobs")
        .select(
          "id,tenant_id,requested_by,kind,status,storage_path,schema_version,byte_size,checksum,record_counts,source_backup_id,error_summary,expires_at,started_at,completed_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("members")
        .select("id", { count: "exact", head: true })
        .or("member_code.is.null,member_code.eq."),
      db
        .from("rate_limit_hits")
        .select("id", { count: "exact", head: true }),
    ]);

    type TenantRow = {
      id: string;
      name: string;
      subdomain: string;
      tier: string;
      status: string;
      approval_status: string;
      approval_risk_flags?: string[] | null;
      approval_reason?: string | null;
      correction_requested_at?: string | null;
      trial_ends_at: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      created_at: string;
      extra_member_slots: number;
      admin_notes: string | null;
      require_mfa: boolean;
      logo_path: string | null;
      parent_tenant_id: string | null;
    };
    const tenantList = (tenants ?? []) as TenantRow[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = async (table: string, tenantId: string, extra?: (q: any) => any) => {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if (extra) q = extra(q);
      const { count: c } = await q;
      return c ?? 0;
    };

    const perTenant = await Promise.all(
      tenantList.map(async (t) => {
        const [
          members,
          attendance,
          attendance30,
          services,
          staff,
          messages,
          audits,
          leaders,
          followups,
          ai,
          lastAtt,
        ] = await Promise.all([
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
          db
            .from("attendance")
            .select("recorded_at")
            .eq("tenant_id", t.id)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const bytes =
          members * ROW_BYTES.members +
          attendance * ROW_BYTES.attendance +
          messages * ROW_BYTES.messages +
          services * ROW_BYTES.services +
          audits * ROW_BYTES.audit_events +
          staff * ROW_BYTES.tenant_users +
          leaders * ROW_BYTES.leader_profiles +
          followups * ROW_BYTES.member_followups +
          ai * ROW_BYTES.ask_mene_messages +
          4096;
        return {
          id: t.id as string,
          members,
          attendance,
          attendance30,
          services,
          staff,
          messages,
          leaders,
          rows:
            members + attendance + messages + services + audits + staff + leaders + followups + ai,
          bytes,
          last_activity: (lastAtt.data?.recorded_at as string | undefined) ?? null,
        };
      }),
    );

    // Storage buckets: sum file sizes (two folder levels deep).
    const storage: Array<{ bucket: string; files: number; bytes: number }> = [];
    const tenantStorage: Record<string, number> = {};
    try {
      const { data: buckets } = await db.storage.listBuckets();
      for (const b of buckets ?? []) {
        let files = 0,
          bytes = 0;
        const { data: top } = await db.storage.from(b.name).list("", { limit: 1000 });
        for (const item of top ?? []) {
          if (item.id) {
            files++;
            bytes += item.metadata?.size ?? 0;
            continue;
          }
          const { data: inner } = await db.storage.from(b.name).list(item.name, { limit: 1000 });
          for (const f of inner ?? []) {
            if (!f.id) continue;
            files++;
            const s = f.metadata?.size ?? 0;
            bytes += s;
            if (tenantList.some((t) => t.id === item.name))
              tenantStorage[item.name] = (tenantStorage[item.name] ?? 0) + s;
          }
        }
        storage.push({ bucket: b.name, files, bytes });
      }
    } catch {
      /* storage listing is best effort */
    }

    // Weekly check-ins across the platform (12 weeks).
    const weekly = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const end = new Date(Date.now() - i * 7 * 864e5);
        const start = new Date(end.getTime() - 7 * 864e5);
        const { count: c } = await db
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .gte("recorded_at", start.toISOString())
          .lt("recorded_at", end.toISOString());
        return { week: start.toISOString().slice(0, 10), checkins: c ?? 0 };
      }),
    );

    const msgHealth: Record<
      string,
      { email_sent: number; sms_sent: number; failed: number; queued: number }
    > = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (msgs ?? []) as any[]) {
      const row = (msgHealth[m.tenant_id!] ??= {
        email_sent: 0,
        sms_sent: 0,
        failed: 0,
        queued: 0,
      });
      if (m.status === "sent") row[m.channel === "sms" ? "sms_sent" : "email_sent"]++;
      else if (m.status === "failed") row.failed++;
      else row.queued++;
    }

    const operators = await listOperatorUsers();
    const opName = Object.fromEntries(
      operators.map((o) => [o.id, o.app_metadata.operator_username ?? o.email]),
    );

    const env = (k: string) => !!process.env[k];
    const day = new Date(Date.now() - 864e5).toISOString();
    const hourAgo = new Date(Date.now() - 36e5).toISOString();
    const [{ count: sent24 }, { count: failed24 }, { count: stuck }] = await Promise.all([
      db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", day),
      db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", day),
      db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued")
        .lt("scheduled_at", hourAgo),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastPaid = ((payments ?? []) as any[]).find((p) => p.status === "success");

    // 90-day daily check-ins and new churches trend
    const since90 = new Date(Date.now() - 90 * 864e5).toISOString();
    let dailyTrends: Array<{
      date: string;
      checkins: number;
      newChurches: number;
      activeChurches: number;
    }> = [];
    try {
      const { data: trendRpc, error: trendErr } = await db.rpc("get_platform_metrics_trend", {
        p_days: 90,
      });
      if (!trendErr && Array.isArray(trendRpc) && trendRpc.length > 0) {
        dailyTrends = (
          trendRpc as Array<{
            day_date: string;
            checkins?: number | string | null;
            new_churches?: number | string | null;
            active_churches?: number | string | null;
          }>
        ).map((r) => ({
          date: String(r.day_date),
          checkins: Number(r.checkins ?? 0),
          newChurches: Number(r.new_churches ?? 0),
          activeChurches: Number(r.active_churches ?? 0),
        }));
      }
    } catch {
      // fallback below
    }

    if (!dailyTrends.length) {
      const { data: attSample } = await db
        .from("attendance")
        .select("recorded_at, tenant_id")
        .gte("recorded_at", since90)
        .limit(60000);

      const dayMap: Record<string, { checkins: number; newChurches: number; churches: Set<string> }> = {};
      for (let i = 90; i >= 0; i--) {
        const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
        dayMap[d] = { checkins: 0, newChurches: 0, churches: new Set<string>() };
      }
      for (const a of attSample ?? []) {
        const d = a.recorded_at?.slice(0, 10);
        if (d && dayMap[d]) {
          dayMap[d].checkins++;
          if (a.tenant_id) dayMap[d].churches.add(a.tenant_id);
        }
      }
      for (const t of tenantList) {
        const d = t.created_at?.slice(0, 10);
        if (d && dayMap[d]) dayMap[d].newChurches++;
      }
      dailyTrends = Object.entries(dayMap).map(([date, val]) => ({
        date,
        checkins: val.checkins,
        newChurches: val.newChurches,
        activeChurches: val.churches.size,
      }));
    }

    const churchNameMap = Object.fromEntries(tenantList.map((t) => [t.id, t.name]));

    return {
      generated_at: new Date().toISOString(),
      tenants: tenantList.map((t) => ({
        ...t,
        sub:
          (
            (subs ?? []) as Array<{
              tenant_id: string;
              period_end: string;
              auto_renew: boolean;
              payment_method: string;
            }>
          ).find((s) => s.tenant_id === t.id) ?? null,
        usage: perTenant.find((p) => p.id === t.id) as {
          members: number;
          attendance: number;
          attendance30: number;
          services: number;
          staff: number;
          messages: number;
          leaders: number;
          rows: number;
          bytes: number;
          last_activity: string | null;
        },
        storage_bytes: tenantStorage[t.id] ?? 0,
        messaging: msgHealth[t.id] ?? { email_sent: 0, sms_sent: 0, failed: 0, queued: 0 },
      })),
      payments: (payments ?? []) as Array<{
        id: string;
        tenant_id: string;
        reference: string;
        amount_kobo: number;
        currency: string;
        tier: string;
        status: string;
        channel: string | null;
        paid_at: string | null;
        created_at: string;
      }>,
      space_requests: (space ?? []) as Array<{
        id: string;
        tenant_id: string;
        extra_slots: number;
        amount_cents: number;
        status: string;
        created_at: string;
      }>,
      audit: (
        (auditRows ?? []) as Array<{
          id: string;
          actor_user_id: string;
          actor_username?: string | null;
          action: string;
          category?: string | null;
          severity?: string | null;
          tenant_id: string | null;
          tenant_name?: string | null;
          detail: unknown;
          created_at: string;
        }>
      ).map((a) => {
        let category: "tenant" | "system" | "security" | "commercial" =
          (a.category as "tenant" | "system" | "security" | "commercial") || "system";
        if (!a.category) {
          if (a.action.startsWith("tenant.") || a.action.startsWith("branch.")) category = "tenant";
          else if (
            a.action.startsWith("operator.") ||
            a.action.includes("password") ||
            a.action.includes("auth")
          )
            category = "security";
          else if (
            a.action.includes("pricing") ||
            a.action.includes("coupon") ||
            a.action.includes("payment")
          )
            category = "commercial";
        }
        let severity: "info" | "warning" | "critical" =
          (a.severity as "info" | "warning" | "critical") || "info";
        if (!a.severity) {
          if (
            a.action.includes("purged") ||
            a.action.includes("delete") ||
            a.action.includes("removed") ||
            a.action.includes("maintenance_enabled")
          ) {
            severity = "critical";
          } else if (
            a.action.includes("warning") ||
            a.action.includes("reject") ||
            a.action.includes("flag") ||
            a.action.includes("reset") ||
            a.action.includes("lockdown") ||
            a.action.includes("broadcast")
          ) {
            severity = "warning";
          }
        }
        const actorName = a.actor_username || (opName[a.actor_user_id] ?? "operator");
        const churchName = a.tenant_name || (a.tenant_id ? (churchNameMap[a.tenant_id] ?? null) : null);
        return {
          ...a,
          detail: serializableRecord(a.detail),
          category,
          severity,
          actor: actorName,
          actor_username: actorName,
          tenant_name: churchName,
        };
      }),
      dailyTrends,
      weekly: weekly.reverse(),
      storage,
      backup_jobs: (
        (backupJobs ?? []) as Array<{
          id: string;
          tenant_id: string;
          requested_by: string;
          kind: "backup" | "pre_restore" | "restore";
          status: "pending" | "running" | "completed" | "failed" | "expired";
          storage_path: string | null;
          schema_version: number;
          byte_size: number;
          checksum: string | null;
          record_counts: Record<string, number>;
          source_backup_id: string | null;
          error_summary: string | null;
          expires_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        }>
      ).map((j) => ({ ...j, requested_by_name: (opName[j.requested_by] ?? "operator") as string })),
      messaging_errors: (() => {
        const cats: Record<string, number> = {};
        for (const m of (msgs ?? []) as Array<{ status: string; error?: string | null }>) {
          if (m.status === "failed") {
            const err = (m.error ?? "").toLowerCase();
            let cat = "Delivery rejection";
            if (err.includes("rate") || err.includes("limit") || err.includes("429"))
              cat = "Provider rate limit";
            else if (
              err.includes("invalid") ||
              err.includes("format") ||
              err.includes("email") ||
              err.includes("phone")
            )
              cat = "Invalid recipient contact";
            else if (err.includes("quiet")) cat = "Quiet hours deferred";
            else if (err.includes("timeout") || err.includes("network")) cat = "Network timeout";
            else if (err.includes("quota") || err.includes("balance"))
              cat = "Provider quota / credits";
            cats[cat] = (cats[cat] ?? 0) + 1;
          }
        }
        return cats;
      })(),
      operators: operators.map((o) => ({
        id: o.id,
        username: o.app_metadata.operator_username ?? o.email,
        last_sign_in_at: o.last_sign_in_at,
        created_at: o.created_at,
        is_me: o.id === context.userId,
      })),
      health: {
        email: env("MENELOG_RESEND_API_KEY"),
        payments: env("PAYSTACK_SECRET_KEY"),
        cron: env("MENELOG_CRON_SECRET"),
        ai: env("LOVABLE_API_KEY"),
        sms: env("AKASEL_API_KEY") || env("AKASEL_API_TOKEN"),
        sent_24h: sent24 ?? 0,
        failed_24h: failed24 ?? 0,
        stuck_queue: stuck ?? 0,
        last_payment_at: lastPaid?.paid_at ?? lastPaid?.created_at ?? null,
        missing_member_codes: missingMemberCodes ?? 0,
        rate_limit_hits: rateLimitCount ?? 0,
      },
    };
  });

/* ---------------- Mutations ---------------- */
const action = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("extend"),
    tenant_id: z.string().uuid(),
    days: z.number().int().min(1).max(730),
  }),
  z.object({ type: z.literal("notes"), tenant_id: z.string().uuid(), notes: z.string().max(4000) }),
  z.object({ type: z.literal("require_mfa"), tenant_id: z.string().uuid(), value: z.boolean() }),
  z.object({ type: z.literal("retry_failed"), tenant_id: z.string().uuid().nullable() }),
  z.object({ type: z.literal("resend_welcome"), tenant_id: z.string().uuid() }),
  z.object({
    type: z.literal("announce"),
    subject: z.string().min(3).max(150),
    body: z.string().min(5).max(5000),
    tiers: z.array(z.enum(["free", "standard", "pro", "premium"])).min(1),
    statuses: z.array(z.enum(["active", "grace", "suspended", "closed"])).min(1),
  }),
  z.object({
    type: z.literal("add_operator"),
    username: z.string().regex(/^[a-z0-9._-]{3,30}$/i),
    password: z.string(),
  }),
  z.object({ type: z.literal("remove_operator"), user_id: z.string().uuid() }),
  z.object({ type: z.literal("reset_operator"), user_id: z.string().uuid(), password: z.string() }),
  z.object({ type: z.literal("change_password"), current: z.string(), next: z.string() }),
  z.object({ type: z.literal("test_email"), to: z.string().trim().email().max(160) }),
  z.object({ type: z.literal("apply_messaging_defaults") }),
  z.object({ type: z.literal("detach_branch"), tenant_id: z.string().uuid() }),
  z.object({ type: z.literal("create_backup"), tenant_id: z.string().uuid() }),
  z.object({
    type: z.literal("restore_backup"),
    backup_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    confirmation_name: z.string().min(1),
    operator_password: z.string().min(1),
  }),
  z.object({
    type: z.literal("approve_church"),
    tenant_id: z.string().uuid(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal("reject_church"),
    tenant_id: z.string().uuid(),
    reason: z.string().min(2),
  }),
  z.object({
    type: z.literal("request_correction"),
    tenant_id: z.string().uuid(),
    reason: z.string().min(5),
  }),
  z.object({
    type: z.literal("flag_church"),
    tenant_id: z.string().uuid(),
    reason: z.string().min(5),
  }),
  z.object({
    type: z.literal("delete_church_permanent"),
    tenant_id: z.string().uuid(),
    confirmation_name: z.string().min(1),
  }),
  z.object({
    type: z.literal("update_profile"),
    username: z.string().regex(/^[a-z0-9._-]{3,40}$/i),
    display_name: z.string().max(80).optional(),
    phone: z.string().max(40).optional(),
  }),
  z.object({
    type: z.literal("reconcile_member_codes"),
    tenant_id: z.string().uuid().nullable().optional(),
  }),
  z.object({
    type: z.literal("cleanup_rate_limits"),
  }),
]);

export type OperatorActionInput = z.infer<typeof action>;

export const downloadBackupArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ backup_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context);
    const { downloadEncryptedBackup } = await import("./backup.server");
    return downloadEncryptedBackup(context.userId, data.backup_id);
  });

export const operatorAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => action.parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context);
    if (!(await rateLimit("operator_action", context.userId, 60, 300)))
      throw new Error("Too many actions in a short time. Wait a few minutes.");
    const db = await admin();
    const me = context.userId;

    switch (data.type) {
      case "extend": {
        const { data: t } = await db
          .from("tenants")
          .select("trial_ends_at,name")
          .eq("id", data.tenant_id)
          .single();
        const { data: s } = await db
          .from("subscriptions")
          .select("period_end")
          .eq("tenant_id", data.tenant_id)
          .maybeSingle();
        const add = (iso: string | null) => {
          const base = iso && new Date(iso) > new Date() ? new Date(iso) : new Date();
          return new Date(base.getTime() + data.days * 864e5);
        };
        if (s) {
          if (String(s.period_end).startsWith("9999"))
            throw new Error("Free plan churches never expire.");
          await db
            .from("subscriptions")
            .update({ period_end: add(s.period_end).toISOString().slice(0, 10) })
            .eq("tenant_id", data.tenant_id);
        }
        if (t?.trial_ends_at)
          await db
            .from("tenants")
            .update({ trial_ends_at: add(t.trial_ends_at).toISOString() })
            .eq("id", data.tenant_id);
        await db
          .from("tenants")
          .update({ status: "active" })
          .eq("id", data.tenant_id)
          .eq("status", "grace");
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
        return {
          ok: true,
          message: data.value
            ? "Two-step sign-in required"
            : "Two-step sign-in requirement removed",
        };
      case "retry_failed": {
        let q = db
          .from("messages")
          .update({
            status: "queued",
            attempts: 0,
            error: null,
            scheduled_at: new Date().toISOString(),
          })
          .eq("status", "failed");
        if (data.tenant_id) q = q.eq("tenant_id", data.tenant_id);
        const { data: rows } = await q.select("id");
        await audit(me, "messages.retried", { count: rows?.length ?? 0 }, data.tenant_id);
        return { ok: true, message: `${rows?.length ?? 0} messages queued again` };
      }
      case "resend_welcome": {
        const { data: t } = await db
          .from("tenants")
          .select("name,contact_email,brand_primary,subdomain")
          .eq("id", data.tenant_id)
          .single();
        if (!t?.contact_email) throw new Error("This church has no contact email.");
        const { renderEmail, sendEmail } = await import("./messaging.server");
        const { SITE_URL } = await import("./site");
        const res = await sendEmail({
          to: t.contact_email,
          fromName: "Mene:Log",
          replyTo: null,
          subject: `Welcome to Mene:Log, ${t.name}`,
          html: renderEmail({
            churchName: t.name,
            brandPrimary: t.brand_primary,
            logoUrl: null,
            subject: `Welcome to Mene:Log`,
            body: `Your church account is ready.\n\nSign in to set up services, members and check-in. Your check-in page is ${SITE_URL}/c/${t.subdomain}.`,
            ctaLabel: "Sign in",
            ctaUrl: `${SITE_URL}/auth`,
          }),
        });
        if (!res.ok) throw new Error(res.error ?? "Email failed");
        await audit(me, "tenant.welcome_resent", {}, data.tenant_id);
        return { ok: true, message: "Welcome email sent" };
      }
      case "announce": {
        if (!(await rateLimit("operator_announce", me, 3, 86400)))
          throw new Error("Announcement limit reached (3 per day). Try again tomorrow.");
        const linkRe = /(https?:\/\/|www\.)[^\s]+/gi;
        const badLink = [data.subject, data.body]
          .flatMap((t) => t.match(linkRe) ?? [])
          .some((u) => !/^(https?:\/\/)?(www\.)?menelog\.site(\/|$)/i.test(u));
        if (badLink)
          throw new Error("Announcements can only link to menelog.site.");
        const { data: ts } = await db
          .from("tenants")
          .select("id,name,brand_primary")
          .in("tier", data.tiers)
          .in("status", data.statuses);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids = (ts ?? []).map((t: any) => t.id);
        if (!ids.length) throw new Error("No churches match this audience.");
        const { data: owners } = await db
          .from("tenant_users")
          .select("tenant_id,user_id")
          .in("tenant_id", ids)
          .in("role", ["owner", "church_admin"])
          .eq("status", "active");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userIds = [...new Set((owners ?? []).map((o: any) => o.user_id))];
        const { data: profiles } = userIds.length
          ? await db.from("profiles").select("id,email").in("id", userIds)
          : { data: [] };
        const emails = [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...new Set((profiles ?? []).map((p: any) => p.email).filter(Boolean)),
        ] as string[];
        const { renderEmail, sendEmail } = await import("./messaging.server");
        const html = renderEmail({
          churchName: "Prime Haven · Mene:Log",
          brandPrimary: "#3b82f6",
          logoUrl: null,
          subject: data.subject,
          body: data.body,
        });
        let sent = 0;
        for (const to of emails.slice(0, 2000)) {
          const r = await sendEmail({
            to,
            subject: data.subject,
            html,
            fromName: "Mene:Log",
            replyTo: null,
          });
          if (r.ok) sent++;
        }
        await audit(me, "announcement.sent", {
          subject: data.subject,
          body: data.body,
          tiers: data.tiers,
          statuses: data.statuses,
          recipients: emails.length,
          sent,
        });
        return {
          ok: true,
          message: `Announcement sent to ${sent} of ${emails.length} administrators`,
        };
      }
      case "add_operator": {
        if (!validOperatorPassword(data.password))
          throw new Error("Password must be 8 to 72 characters.");
        const username = normaliseUsername(data.username);
        if (await findOperator(username)) throw new Error("That username is already taken.");
        const { data: created, error } = await db.auth.admin.createUser({
          email: operatorEmail(username),
          password: crypto.randomUUID() + "Aa1!",
          email_confirm: true,
          app_metadata: {
            operator: true,
            operator_username: username,
            operator_hash: hashPassword(data.password),
          },
        });
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
        if (!validOperatorPassword(data.password))
          throw new Error("Password must be 8 to 72 characters.");
        const target = (await listOperatorUsers()).find((o) => o.id === data.user_id);
        if (!target) throw new Error("Operator not found");
        await db.auth.admin.updateUserById(data.user_id, {
          app_metadata: { ...target.app_metadata, operator_hash: hashPassword(data.password) },
        });
        await audit(me, "operator.password_reset", {
          username: target.app_metadata.operator_username,
        });
        return { ok: true, message: "Password reset" };
      }
      case "test_email": {
        if (!(await rateLimit("operator_test_email", me, 5, 3600)))
          throw new Error("Too many test emails. Try again later.");
        const target = data.to.toLowerCase();
        const allowed = new Set(
          [process.env["ADMIN_ALERT_EMAIL"], "support@menelog.site"]
            .filter(Boolean)
            .map((e) => String(e).trim().toLowerCase()),
        );
        const { data: meUser } = await db.auth.admin.getUserById(me);
        if (meUser?.user?.email) allowed.add(meUser.user.email.toLowerCase());
        if (!allowed.has(target))
          throw new Error("Test emails can only go to the platform alert or support address.");
        const { renderEmail, sendEmail } = await import("./messaging.server");
        const html = renderEmail({
          churchName: "Prime Haven · Mene:Log",
          brandPrimary: "#3b82f6",
          logoUrl: null,
          subject: "Your Mene:Log email is working",
          body: "This is a test email from the Prime Haven console. If you can read this, email delivery is working.",
        });
        const r = await sendEmail({
          to: data.to,
          subject: "Your Mene:Log email is working",
          html,
          fromName: "Mene:Log",
          replyTo: null,
        });
        await audit(me, "platform.test_email", { to: data.to, ok: r.ok });
        if (!r.ok) throw new Error(r.error ?? "Email could not be sent");
        return { ok: true, message: `Test email sent to ${data.to}` };
      }
      case "apply_messaging_defaults": {
        const { readSettings } = await import("./settings.server");
        const s = await readSettings(true);
        const { error } = await db
          .from("tenants")
          .update({
            quiet_hour_start: s.messaging.quiet_start,
            quiet_hour_end: s.messaging.quiet_end,
            absence_threshold: s.messaging.default_absence_threshold,
          })
          .neq("status", "closed");
        if (error) throw new Error("Could not apply to churches.");
        await audit(me, "platform.messaging_defaults_applied", s.messaging);
        return { ok: true, message: "Quiet hours and absence alerts applied to every church" };
      }
      case "detach_branch": {
        const { error } = await db
          .from("tenants")
          .update({ parent_tenant_id: null })
          .eq("id", data.tenant_id);
        if (error) throw new Error("Could not detach this branch.");
        await audit(me, "branch.detached", {}, data.tenant_id);
        return { ok: true, message: "Branch is now a standalone church" };
      }
      case "change_password": {
        if (!validOperatorPassword(data.next))
          throw new Error("New password must be 8 to 72 characters.");
        const self = (await listOperatorUsers()).find((o) => o.id === me);
        if (!self || !verifyPassword(data.current, self.app_metadata.operator_hash))
          throw new Error("Current password is incorrect.");
        await db.auth.admin.updateUserById(me, {
          app_metadata: { ...self.app_metadata, operator_hash: hashPassword(data.next) },
        });
        await audit(me, "operator.password_changed");
        return { ok: true, message: "Password changed" };
      }
      case "create_backup": {
        const { createTenantBackup } = await import("./backup.server");
        const res = await createTenantBackup(me, data.tenant_id, "backup");
        return {
          ok: true,
          message: `Encrypted backup created for ${res.tenantName} (${(res.byteSize / 1024).toFixed(1)} KB)`,
        };
      }
      case "restore_backup": {
        const { restoreTenantBackup } = await import("./backup.server");
        const self = (await listOperatorUsers()).find((o) => o.id === me);
        const username = self?.app_metadata?.operator_username ?? self?.email ?? "operator";
        const res = await restoreTenantBackup(me, {
          backupId: data.backup_id,
          tenantId: data.tenant_id,
          confirmationName: data.confirmation_name,
          operatorPassword: data.operator_password,
          operatorUsername: username,
        });
        return { ok: true, message: res.message };
      }
      case "approve_church": {
        const { error } = await db.rpc("platform_approve_church", {
          p_tenant: data.tenant_id,
          p_notes: data.notes || null,
        });
        if (error) throw new Error(error.message);
        await audit(me, "tenant.approved", { notes: data.notes || null }, data.tenant_id, {
          category: "tenant",
          severity: "info",
        });
        return { ok: true, message: "Church approved and activated" };
      }
      case "reject_church": {
        const { error } = await db.rpc("platform_reject_church", {
          p_tenant: data.tenant_id,
          p_reason: data.reason,
        });
        if (error) throw new Error(error.message);
        await audit(me, "tenant.rejected", { reason: data.reason }, data.tenant_id, {
          category: "tenant",
          severity: "warning",
        });
        return { ok: true, message: "Church rejected" };
      }
      case "request_correction": {
        const { error } = await db.rpc("platform_request_correction", {
          p_tenant: data.tenant_id,
          p_reason: data.reason,
        });
        if (error) throw new Error(error.message);
        await audit(me, "tenant.correction_requested", { reason: data.reason }, data.tenant_id, {
          category: "tenant",
          severity: "info",
        });
        return { ok: true, message: "Correction request sent to church" };
      }
      case "flag_church": {
        const { error } = await db.rpc("platform_flag_church", {
          p_tenant: data.tenant_id,
          p_reason: data.reason,
        });
        if (error) throw new Error(error.message);
        await audit(me, "tenant.flagged", { reason: data.reason }, data.tenant_id, {
          category: "tenant",
          severity: "warning",
        });
        return { ok: true, message: "Church flagged for review" };
      }
      case "delete_church_permanent": {
        const { data: tenant } = await db
          .from("tenants")
          .select("name, subdomain, tier")
          .eq("id", data.tenant_id)
          .single();
        if (!tenant) throw new Error("Church not found.");

        if (data.confirmation_name.trim().toLowerCase() !== tenant.name.trim().toLowerCase()) {
          throw new Error(`Confirmation church name does not match "${tenant.name}".`);
        }

        // Try the stored procedure platform_purge_tenant first
        const { error: rpcErr } = await db.rpc("platform_purge_tenant", {
          p_tenant_id: data.tenant_id,
          p_confirm_name: data.confirmation_name.trim(),
        });

        if (rpcErr) {
          // Direct cascading purge via admin database client
          await db.from("watch_sessions").delete().eq("tenant_id", data.tenant_id);
          await db.from("attendance_records").delete().eq("tenant_id", data.tenant_id);
          await db.from("messages").delete().eq("tenant_id", data.tenant_id);
          await db.from("members").delete().eq("tenant_id", data.tenant_id);
          await db.from("services").delete().eq("tenant_id", data.tenant_id);
          await db.from("support_tickets").delete().eq("tenant_id", data.tenant_id);
          await db.from("structure_levels").delete().eq("tenant_id", data.tenant_id);
          await db.from("backups").delete().eq("tenant_id", data.tenant_id);
          await db.from("subscriptions").delete().eq("tenant_id", data.tenant_id);
          await db.from("tenant_users").delete().eq("tenant_id", data.tenant_id);
          await db.from("tenants").update({ parent_tenant_id: null }).eq("parent_tenant_id", data.tenant_id);
          await db.from("branches").delete().eq("tenant_id", data.tenant_id);
          await db.from("audit_events").delete().eq("tenant_id", data.tenant_id);
          const { error: delErr } = await db.from("tenants").delete().eq("id", data.tenant_id);
          if (delErr) throw new Error(delErr.message);
        }

        await audit(
          me,
          "tenant.permanently_purged",
          { name: tenant.name, subdomain: tenant.subdomain, tier: tenant.tier },
          data.tenant_id,
          { category: "tenant", severity: "critical", tenantName: tenant.name },
        );
        return { ok: true, message: `Church "${tenant.name}" and all records have been permanently deleted from the database.` };
      }
      case "update_profile": {
        const cleanUsername = normaliseUsername(data.username);
        const { error: rpcErr } = await db.rpc("platform_update_my_profile", {
          p_username: cleanUsername,
          p_display_name: data.display_name?.trim() || null,
          p_phone: data.phone?.trim() || null,
        });

        if (rpcErr) {
          // Direct auth metadata fallback
          await db.auth.admin.updateUserById(me, {
            user_metadata: {
              operator_username: cleanUsername,
              display_name: data.display_name?.trim() || null,
              phone: data.phone?.trim() || null,
            },
            app_metadata: {
              operator_username: cleanUsername,
            },
          });
        }
        await audit(
          me,
          "operator.profile_updated",
          { username: cleanUsername, display_name: data.display_name?.trim() || null },
          null,
          { category: "security", severity: "info", actorUsername: cleanUsername },
        );
        return { ok: true, message: `Profile updated. Operator username is now "${cleanUsername}".` };
      }
      case "reconcile_member_codes": {
        const { data: res, error } = await db.rpc("reconcile_member_codes", {
          p_tenant_id: data.tenant_id || null,
        });
        if (error) {
          // Resilient fallback if RPC not yet created in PostgreSQL
          const { data: targetMembers } = await db
            .from("members")
            .select("id, tenant_id")
            .or("member_code.is.null,member_code.eq.")
            .limit(500);
          let count = 0;
          for (const m of targetMembers ?? []) {
            const randomCode = `ML-${Math.floor(10000 + Math.random() * 90000)}`;
            await db.from("members").update({ member_code: randomCode }).eq("id", m.id);
            count++;
          }
          await audit(me, "database.member_codes_reconciled", { reconciled: count });
          return { ok: true, message: `Reconciled ${count} member codes.` };
        }
        const updated = (res as { members_reconciled?: number })?.members_reconciled ?? 0;
        await audit(me, "database.member_codes_reconciled", { reconciled: updated });
        return { ok: true, message: `Reconciled ${updated} missing member codes.` };
      }
      case "cleanup_rate_limits": {
        const { data: res, error } = await db.rpc("cleanup_expired_rate_limits");
        let deleted = 0;
        if (error) {
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count } = await db
            .from("rate_limit_hits")
            .delete({ count: "exact" })
            .lt("created_at", oneDayAgo);
          deleted = count ?? 0;
        } else {
          deleted = typeof res === "number" ? res : 0;
        }
        await audit(me, "database.rate_limits_purged", { purged: deleted });
        return { ok: true, message: `Purged ${deleted} expired rate limit entries.` };
      }
    }
  });

/* ---------------- One-Click Isolated Church Database Export ---------------- */
export const exportChurchDatabaseDump = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context);
    const db = await admin();
    const [
      { data: tenant },
      { data: branches },
      { data: services },
      { data: members },
      { data: attendance },
      { data: tickets },
      { data: subscriptions },
      { data: users },
      { data: watchSessions },
    ] = await Promise.all([
      db.from("tenants").select("*").eq("id", data.tenant_id).single(),
      db.from("branches").select("*").eq("tenant_id", data.tenant_id),
      db.from("services").select("*").eq("tenant_id", data.tenant_id),
      db.from("members").select("*").eq("tenant_id", data.tenant_id),
      db.from("attendance_records").select("*").eq("tenant_id", data.tenant_id).limit(10000),
      db.from("support_tickets").select("*").eq("tenant_id", data.tenant_id),
      db.from("subscriptions").select("*").eq("tenant_id", data.tenant_id),
      db.from("tenant_users").select("id, role, branch_id, created_at").eq("tenant_id", data.tenant_id),
      db.from("watch_sessions").select("*").eq("tenant_id", data.tenant_id).limit(5000),
    ]);

    await audit(context.userId, "tenant.database_dump_exported", { tenant_id: data.tenant_id });

    return {
      exported_at: new Date().toISOString(),
      platform: "Mene:Log Prime Haven Console",
      church: tenant?.name || "Church",
      tenant,
      branches: branches ?? [],
      services: services ?? [],
      members: members ?? [],
      attendance_records: attendance ?? [],
      support_tickets: tickets ?? [],
      subscriptions: subscriptions ?? [],
      tenant_users: users ?? [],
      watch_sessions: watchSessions ?? [],
    };
  });

/* ---------------- Live service checks ---------------- */
export const healthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context);
    const timed = async (fn: () => Promise<boolean>) => {
      const t = Date.now();
      try {
        const ok = await fn();
        return { ok, ms: Date.now() - t };
      } catch {
        return { ok: false, ms: Date.now() - t };
      }
    };
    const resend = process.env["MENELOG_RESEND_API_KEY"];
    const paystack = process.env["PAYSTACK_SECRET_KEY"];
    const ai = process.env["LOVABLE_API_KEY"];
    const [email, payments, assistant, database] = await Promise.all([
      timed(
        async () =>
          !!resend &&
          (
            await fetch("https://api.resend.com/domains", {
              headers: { Authorization: `Bearer ${resend}` },
            })
          ).ok,
      ),
      timed(
        async () =>
          !!paystack &&
          (
            await fetch("https://api.paystack.co/transaction?perPage=1", {
              headers: { Authorization: `Bearer ${paystack}` },
            })
          ).ok,
      ),
      timed(async () => {
        if (!ai) return false;
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${ai}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.8-flash",
            messages: [{ role: "user", content: "Reply with OK" }],
            max_tokens: 5,
          }),
        });
        return r.ok;
      }),
      timed(async () => {
        const db = await admin();
        const { error } = await db.from("tenants").select("id", { head: true, count: "exact" });
        return !error;
      }),
    ]);
    await audit(context.userId, "platform.health_check", {
      email: email.ok,
      payments: payments.ok,
      ai: assistant.ok,
      database: database.ok,
    });
    return { checked_at: new Date().toISOString(), email, payments, assistant, database };
  });
