import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Watch Live: members enter their personal member code (the same code inside their
 * check-in QR). Everything runs server-side with the service-role client; the code
 * is re-verified on every heartbeat so a session can't be forged from the browser.
 */

const base = z.object({
  subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/),
  code: z.string().trim().toLowerCase().regex(/^[0-9a-f]{32}$/, "That member code isn't valid"),
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
  const { data: plan } = await admin.from("plan_config").select("config").eq("tier", tenant.tier).maybeSingle();
  const cfg = (plan?.config ?? {}) as Record<string, unknown>;
  const enabled = typeof cfg["watch_live"] === "boolean" ? cfg["watch_live"] : tenant.tier === "premium";
  if (!enabled) return { error: "Watch Live isn't included in this church's package." } as const;

  const hash = await sha256Hex(code);
  const { data: token } = await admin
    .from("qr_tokens")
    .select("member_id")
    .eq("tenant_id", tenant.id)
    .eq("token_hash", `\\x${hash}`)
    .is("revoked_at", null)
    .maybeSingle();
  if (!token) return { error: "We couldn't find that member code. Check it and try again." } as const;

  const { data: member } = await admin
    .from("members")
    .select("id, full_name, status, branch_id")
    .eq("id", token.member_id)
    .maybeSingle();
  if (!member || member.status === "archived" || member.status === "anonymised") {
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

    const { data: services } = await supabaseAdmin
      .from("services")
      .select("id, name, service_date, stream_url, online_min_minutes")
      .eq("tenant_id", v.tenant.id)
      .eq("is_open", true)
      .not("stream_url", "is", null)
      .order("service_date", { ascending: false })
      .limit(5);

    const ids = (services ?? []).map((s) => s.id);
    const { data: sessions } = ids.length
      ? await supabaseAdmin.from("watch_sessions").select("service_id, seconds").eq("member_id", v.member.id).in("service_id", ids)
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
        await supabaseAdmin.from("watch_sessions").update({ last_ping: now.toISOString() }).eq("id", existing.id);
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
