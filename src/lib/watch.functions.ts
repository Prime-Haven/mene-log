import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Watch Live: members enter their personal member code (e.g. ML-10294 or token).
 * Everything runs server-side with the service-role client; the code
 * is re-verified on every heartbeat so a session can't be forged from the browser.
 */

const base = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,40}$/),
  code: z
    .string()
    .trim()
    .min(2, "Please enter your member code")
    .max(64, "Member code is too long"),
});

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveViewer(admin: Admin, subdomain: string, code: string) {
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, tier, status, approval_status")
    .eq("subdomain", subdomain)
    .maybeSingle();
  if (!tenant || tenant.status === "closed" || tenant.status === "suspended") {
    return { error: "This church's live service isn't available." } as const;
  }
  const { data: plan } = await admin
    .from("plan_config")
    .select("config")
    .eq("tier", tenant.tier)
    .maybeSingle();
  const cfg = (plan?.config ?? {}) as Record<string, unknown>;
  const enabled =
    typeof cfg["watch_live"] === "boolean" ? cfg["watch_live"] : tenant.tier === "premium";
  if (!enabled) return { error: "Watch Live isn't included in this church's package." } as const;

  const rawCode = code.trim();
  const normalized = rawCode.toUpperCase().replace(/[\s-]+/g, "");
  let member: { id: string; full_name: string; status: string; branch_id: string | null } | null =
    null;

  // Caller input is never placed inside a filter expression: only safe code
  // characters survive and each lookup uses exact-value parameters.
  const safe = normalized.replace(/[^A-Z0-9]/g, "").slice(0, 32);
  const bare = safe.startsWith("ML") ? safe.slice(2) : safe;
  const candidates = bare ? Array.from(new Set([`ML-${bare}`, `ML${bare}`, bare])) : [];

  if (candidates.length) {
    const { data: byCode } = await admin
      .from("members")
      .select("id, full_name, status, branch_id, member_code")
      .eq("tenant_id", tenant.id)
      .in("member_code", candidates)
      .limit(1);
    if (byCode?.[0]) member = byCode[0];
  }

  // Fallback: match by phone number if user entered their phone
  if (!member && rawCode.length >= 9) {
    const { data: phoneMember } = await admin
      .from("members")
      .select("id, full_name, status, branch_id, member_code")
      .eq("tenant_id", tenant.id)
      .eq("phone", rawCode.replace(/[^0-9+]/g, ""))
      .limit(1);
    if (phoneMember?.[0]) member = phoneMember[0];
  }

  // Fallback: QR token hash
  if (!member && /^[A-Za-z0-9_-]{8,128}$/.test(rawCode)) {
    const hash = await sha256Hex(rawCode.toLowerCase());
    const { data: token } = await admin
      .from("qr_tokens")
      .select("member_id")
      .eq("tenant_id", tenant.id)
      .eq("token_hash", `\\x${hash}`)
      .is("revoked_at", null)
      .maybeSingle();

    if (token) {
      const { data: memberByToken } = await admin
        .from("members")
        .select("id, full_name, status, branch_id")
        .eq("id", token.member_id)
        .maybeSingle();
      if (memberByToken) {
        member = memberByToken;
      }
    }
  }

  if (!member) {
    return {
      error:
        "We couldn't find that member code. Please enter the code printed under your member QR (e.g. ML-1024).",
    } as const;
  }

  if (member.status === "archived" || member.status === "anonymised") {
    return { error: "This member code is no longer active." } as const;
  }
  return { tenant, member } as const;
}

export const startWatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => base.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const v = await resolveViewer(supabaseAdmin, data.subdomain, data.code);
    if ("error" in v) return { ok: false as const, message: v.error };

    // Only stream services that are explicitly toggled online (is_live = true)
    const { data: services } = await supabaseAdmin
      .from("services")
      .select("id, name, service_date, stream_url, online_min_minutes, is_live")
      .eq("tenant_id", v.tenant.id)
      .eq("is_open", true)
      .eq("is_live", true)
      .not("stream_url", "is", null)
      .order("service_date", { ascending: false })
      .limit(5);

    const ids = (services ?? []).map((s) => s.id);
    const { data: sessions } = ids.length
      ? await supabaseAdmin
          .from("watch_sessions")
          .select("service_id, seconds")
          .eq("member_id", v.member.id)
          .in("service_id", ids)
      : { data: [] };

    return {
      ok: true as const,
      church: v.tenant.name,
      member: v.member.full_name.split(" ")[0] ?? v.member.full_name,
      services: (services ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        date: s.service_date,
        url: s.stream_url as string,
        minMinutes: s.online_min_minutes,
        watchedSeconds: sessions?.find((x) => x.service_id === s.id)?.seconds ?? 0,
      })),
    };
  });

export const pingWatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => base.extend({ service_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const v = await resolveViewer(supabaseAdmin, data.subdomain, data.code);
    if ("error" in v) return { ok: false as const, message: v.error };

    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("id, is_open, stream_url, online_min_minutes, branch_id")
      .eq("id", data.service_id)
      .eq("tenant_id", v.tenant.id)
      .maybeSingle();
    if (!svc || !svc.is_open || !svc.stream_url) {
      return { ok: false as const, message: "This live service has ended." };
    }

    const now = new Date();
    const { data: existing } = await supabaseAdmin
      .from("watch_sessions")
      .select("id, seconds, last_ping")
      .eq("service_id", svc.id)
      .eq("member_id", v.member.id)
      .maybeSingle();

    let seconds = 0;
    if (!existing) {
      await supabaseAdmin.from("watch_sessions").insert({
        tenant_id: v.tenant.id,
        service_id: svc.id,
        member_id: v.member.id,
      });
    } else {
      // Credit real elapsed time only, capped so a stalled tab can't inflate totals.
      const elapsed = Math.floor((now.getTime() - new Date(existing.last_ping).getTime()) / 1000);
      const credit = elapsed >= 20 ? Math.min(elapsed, 75) : 0;
      seconds = existing.seconds + credit;
      if (credit > 0) {
        await supabaseAdmin
          .from("watch_sessions")
          .update({ seconds, last_ping: now.toISOString() })
          .eq("id", existing.id);
      } else if (elapsed < 0 || elapsed > 75) {
        await supabaseAdmin
          .from("watch_sessions")
          .update({ last_ping: now.toISOString() })
          .eq("id", existing.id);
      }
    }

    let recorded = false;
    if (seconds >= svc.online_min_minutes * 60) {
      const { data: att } = await supabaseAdmin
        .from("attendance")
        .select("id")
        .eq("service_id", svc.id)
        .eq("member_id", v.member.id)
        .maybeSingle();
      if (att) recorded = true;
      else {
        const { error } = await supabaseAdmin.from("attendance").insert({
          tenant_id: v.tenant.id,
          service_id: svc.id,
          member_id: v.member.id,
          branch_id: v.member.branch_id ?? svc.branch_id,
          method: "online",
          designation: "member",
        });
        recorded = !error || error.code === "23505";
      }
    }
    return { ok: true as const, seconds, recorded, minMinutes: svc.online_min_minutes };
  });

/** Admin query for online attendance & live streaming stats */
export const getOnlineAttendanceOverview = createServerFn({ method: "GET" })
  .inputValidator((d: { tenant_id: string; service_id?: string }) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        service_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Get services with streaming configured
    let serviceQuery = supabaseAdmin
      .from("services")
      .select("id, name, service_date, is_open, stream_url, online_min_minutes")
      .eq("tenant_id", data.tenant_id)
      .order("service_date", { ascending: false });

    if (data.service_id) {
      serviceQuery = serviceQuery.eq("id", data.service_id);
    } else {
      serviceQuery = serviceQuery.limit(10);
    }

    const { data: services = [] } = await serviceQuery;
    const serviceIds = (services ?? []).map((s) => s.id);

    if (serviceIds.length === 0) {
      return {
        services: [],
        activeViewersCount: 0,
        onlineAttendees: [],
      };
    }

    // 2. Active viewers within last 3 minutes
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { count: activeCount } = await supabaseAdmin
      .from("watch_sessions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", data.tenant_id)
      .in("service_id", serviceIds)
      .gte("last_ping", threeMinutesAgo);

    // 3. Online attendance records for these services
    const { data: onlineAtt = [] } = await supabaseAdmin
      .from("attendance")
      .select(
        `
        id,
        service_id,
        recorded_at,
        method,
        member:members (
          id,
          full_name,
          member_code,
          phone,
          status
        )
      `,
      )
      .eq("tenant_id", data.tenant_id)
      .eq("method", "online")
      .in("service_id", serviceIds)
      .order("recorded_at", { ascending: false })
      .limit(100);

    // 4. Watch sessions breakdown
    const { data: watchSessions = [] } = await supabaseAdmin
      .from("watch_sessions")
      .select("service_id, seconds, member_id")
      .eq("tenant_id", data.tenant_id)
      .in("service_id", serviceIds);

    const totalSecondsWatched = (watchSessions ?? []).reduce(
      (sum, item) => sum + (item.seconds || 0),
      0,
    );

    return {
      services: (services ?? []).map((s) => {
        const svcSessions = (watchSessions ?? []).filter((w) => w.service_id === s.id);
        const svcAtt = (onlineAtt ?? []).filter((a) => a.service_id === s.id);
        return {
          ...s,
          viewerCount: svcSessions.length,
          attendeeCount: svcAtt.length,
          totalMinutes: Math.round(
            svcSessions.reduce((acc, curr) => acc + (curr.seconds || 0), 0) / 60,
          ),
        };
      }),
      activeViewersCount: activeCount ?? 0,
      totalMinutesWatched: Math.round(totalSecondsWatched / 60),
      onlineAttendees: (onlineAtt ?? []).map((a) => ({
        id: a.id,
        service_id: a.service_id,
        recorded_at: a.recorded_at,
        member: a.member,
      })),
    };
  });
