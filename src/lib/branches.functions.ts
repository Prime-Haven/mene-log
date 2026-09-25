import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Premium head offices run branches. A branch is its own church account with its
 * own check-in address, running on the Pro plan and linked to the head office.
 */

const subdomain = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/, "Use 3–40 lowercase letters, numbers or dashes");

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function featureOn(tier: string, key: string, fallback: boolean) {
  const db = await adminDb();
  const { data } = await db.from("plan_config").select("config").eq("tier", tier as "premium").maybeSingle();
  const v = (data?.config as Record<string, unknown> | undefined)?.[key];
  return typeof v === "boolean" ? v : fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertHeadOffice(context: { supabase: any }, tenantId: string) {
  const { data: isAdmin } = await context.supabase.rpc("is_tenant_admin", { _tenant: tenantId });
  if (isAdmin !== true) throw new Error("Only the head office administrator can manage branches.");
  const db = await adminDb();
  const { data: t } = await db.from("tenants").select("id, name, tier, parent_tenant_id, brand_primary, brand_accent, logo_path, background_path, group_vocabulary").eq("id", tenantId).single();
  if (!t) throw new Error("Church not found.");
  if (t.parent_tenant_id) throw new Error("Branches can't create their own branches.");
  if (!(await featureOn(t.tier, "branches", t.tier === "premium"))) throw new Error("Branches are part of the Premium plan.");
  return t;
}

async function subdomainFree(value: string) {
  const db = await adminDb();
  const { data } = await db.from("tenants").select("id").eq("subdomain", value).maybeSingle();
  return !data;
}

async function inviteOwner(tenantId: string, email: string, churchName: string, headName: string) {
  const db = await adminDb();
  let userId: string | null = null;
  const { data: invited, error } = await db.auth.admin.inviteUserByEmail(email);
  if (invited?.user) userId = invited.user.id;
  else if (error) {
    const { data: prof } = await db.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
    userId = prof?.id ?? null;
  }
  if (!userId) return false;
  await db.from("tenant_users").insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
  const { sendBrandedEmailNow } = await import("@/lib/queue.server");
  await sendBrandedEmailNow({
    tenantId,
    to: email,
    subject: `${churchName} is ready on Mene:Log`,
    body: `${churchName} has been set up as a branch of ${headName} on Mene:Log. You are its administrator.\n\nCheck your inbox for the sign-in link, set your password, and you'll land on your branch dashboard.`,
  });
  return true;
}

async function createBranchTenant(parent: { id: string; brand_primary: string; brand_accent: string; logo_path: string | null; background_path: string | null; group_vocabulary: string }, v: { name: string; subdomain: string; city: string | null }, active: boolean, notes: string | null) {
  const db = await adminDb();
  const { data: sub } = await db.from("subscriptions").select("period_end").eq("tenant_id", parent.id).maybeSingle();
  const { data: t, error } = await db
    .from("tenants")
    .insert({
      name: v.name,
      subdomain: v.subdomain,
      tier: "standard",
      status: active ? "active" : "suspended",
      approval_status: active ? "approved" : "pending_approval",
      approved_at: active ? new Date().toISOString() : null,
      parent_tenant_id: parent.id,
      brand_primary: parent.brand_primary,
      brand_accent: parent.brand_accent,
      logo_path: parent.logo_path,
      background_path: parent.background_path,
      group_vocabulary: parent.group_vocabulary,
      admin_notes: notes,
    })
    .select("id")
    .single();
  if (error || !t) throw new Error(error?.code === "23505" ? "That check-in address is taken." : "Could not create the branch.");
  await db.from("subscriptions").upsert({ tenant_id: t.id, tier: "standard", period_start: new Date().toISOString().slice(0, 10), period_end: sub?.period_end ?? "9999-12-31", payment_method: "card", auto_renew: false });
  if (v.city) await db.from("branches").insert({ tenant_id: t.id, name: v.name, city: v.city, is_default: true });
  return t.id as string;
}

export const createBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenant_id: z.string().uuid(), name: z.string().trim().min(2).max(120), subdomain, city: z.string().trim().max(80), admin_email: z.string().trim().email().max(160) }).parse(d))
  .handler(async ({ data, context }) => {
    const head = await assertHeadOffice(context, data.tenant_id);
    if (!(await subdomainFree(data.subdomain))) return { ok: false as const, message: "That check-in address is taken." };
    const id = await createBranchTenant(head, { name: data.name, subdomain: data.subdomain, city: data.city || null }, true, null);
    const invited = await inviteOwner(id, data.admin_email, data.name, head.name);
    const db = await adminDb();
    await db.rpc("log_audit", { _tenant: head.id, _action: "branch.created", _target: data.subdomain, _detail: { branch: id }, _actor: context.userId });
    return { ok: true as const, message: invited ? `Branch created. ${data.admin_email} has been invited.` : "Branch created, but the admin invite could not be sent." };
  });

export const listBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHeadOffice(context, data.tenant_id);
    const db = await adminDb();
    const { data: rows } = await db.from("tenants").select("id, name, subdomain, status, approval_status, admin_notes, created_at").eq("parent_tenant_id", data.tenant_id).order("created_at");
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const count = async (table: "members" | "attendance" | "leader_profiles" | "services", id: string, recent = false) => {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", id);
      if (recent) q = q.gte("recorded_at", since30);
      const { count: c } = await q;
      return c ?? 0;
    };
    const branches = await Promise.all((rows ?? []).map(async (b) => {
      const [members, checkins30, leaders, services, last] = await Promise.all([
        count("members", b.id), count("attendance", b.id, true), count("leader_profiles", b.id), count("services", b.id),
        db.from("attendance").select("recorded_at").eq("tenant_id", b.id).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      let request: { contact_name?: string; email?: string; phone?: string } | null = null;
      if (b.approval_status === "pending_approval") { try { request = JSON.parse(b.admin_notes ?? "null"); } catch { request = null; } }
      return { id: b.id, name: b.name, subdomain: b.subdomain, status: b.status, pending: b.approval_status === "pending_approval", request, created_at: b.created_at, members, checkins30, leaders, services, last_activity: (last.data?.recorded_at as string | undefined) ?? null };
    }));
    return branches;
  });

export const manageBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenant_id: z.string().uuid(), branch_id: z.string().uuid(), action: z.enum(["approve", "reject", "suspend", "restore", "remove"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const head = await assertHeadOffice(context, data.tenant_id);
    const db = await adminDb();
    const { data: b } = await db.from("tenants").select("id, name, parent_tenant_id, approval_status, admin_notes").eq("id", data.branch_id).single();
    if (!b || b.parent_tenant_id !== head.id) throw new Error("That branch doesn't belong to your church.");
    let message = "Done";
    if (data.action === "approve") {
      if (b.approval_status !== "pending_approval") throw new Error("This branch is already approved.");
      let email: string | null = null;
      try { email = (JSON.parse(b.admin_notes ?? "{}") as { email?: string }).email ?? null; } catch { /* no contact */ }
      await db.from("tenants").update({ status: "active", approval_status: "approved", approved_at: new Date().toISOString(), admin_notes: null }).eq("id", b.id);
      if (email) await inviteOwner(b.id, email, b.name, head.name);
      message = email ? `Branch approved. ${email} has been invited.` : "Branch approved.";
    } else if (data.action === "reject") {
      await db.from("tenants").update({ status: "closed", approval_status: "rejected", parent_tenant_id: null }).eq("id", b.id);
      message = "Branch request declined.";
    } else if (data.action === "suspend") {
      await db.from("tenants").update({ status: "suspended" }).eq("id", b.id); message = "Branch suspended.";
    } else if (data.action === "restore") {
      await db.from("tenants").update({ status: "active" }).eq("id", b.id); message = "Branch restored.";
    } else {
      await db.from("tenants").update({ status: "closed", parent_tenant_id: null }).eq("id", b.id); message = "Branch removed and closed.";
    }
    await db.rpc("log_audit", { _tenant: head.id, _action: `branch.${data.action}`, _target: b.name, _detail: { branch: b.id }, _actor: context.userId });
    return { ok: true as const, message };
  });

/** Public: a branch asks to join from the head office's check-in page. */
export const requestBranch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ parent: subdomain, name: z.string().trim().min(2).max(120), subdomain, city: z.string().trim().min(2).max(80), contact_name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), phone: z.string().trim().min(9).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const db = await adminDb();
    const ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
    const { data: allowed } = await db.rpc("check_rate_limit", { _bucket: "branch_request", _identifier: ip, _max: 3, _window_seconds: 3600 });
    if (allowed === false) return { ok: false as const, message: "Too many requests. Please try again in an hour." };
    const { data: parent } = await db.from("tenants").select("id, name, tier, status, parent_tenant_id, brand_primary, brand_accent, logo_path, background_path, group_vocabulary").eq("subdomain", data.parent).maybeSingle();
    if (!parent || parent.parent_tenant_id || parent.status !== "active") return { ok: false as const, message: "This church isn't accepting branch requests." };
    if (!(await featureOn(parent.tier, "branches", parent.tier === "premium"))) return { ok: false as const, message: "This church isn't accepting branch requests." };
    if (!(await subdomainFree(data.subdomain))) return { ok: false as const, message: "That check-in address is taken. Try another." };
    await createBranchTenant(parent, { name: data.name, subdomain: data.subdomain, city: data.city }, false, JSON.stringify({ contact_name: data.contact_name, email: data.email.toLowerCase(), phone: data.phone }));
    await db.rpc("log_audit", { _tenant: parent.id, _action: "branch.requested", _target: data.subdomain, _detail: { name: data.name } });
    return { ok: true as const, message: `Request sent. ${parent.name} will review it and email ${data.email} once approved.` };
  });

/** Public: what a check-in page should offer, plus head office / branch links. */
export const getCheckinContext = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ subdomain: z.string().trim().toLowerCase().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const db = await adminDb();
    const { data: t } = await db.from("tenants").select("id, tier, parent_tenant_id, trial_ends_at").eq("subdomain", data.subdomain).maybeSingle();
    if (!t) return null;
    const inTrial = !!t.trial_ends_at && new Date(t.trial_ends_at).getTime() > Date.now();
    const [qr, leaders, watchLive, branchesOn] = await Promise.all([
      featureOn(t.tier, "qr", t.tier !== "free").then((v) => v || inTrial),
      featureOn(t.tier, "leaders", t.tier === "standard" || t.tier === "premium"),
      featureOn(t.tier, "watch_live", t.tier === "premium"),
      featureOn(t.tier, "branches", t.tier === "premium"),
    ]);
    const parent = t.parent_tenant_id ? (await db.from("tenants").select("name, subdomain").eq("id", t.parent_tenant_id).maybeSingle()).data : null;
    const branches = !t.parent_tenant_id ? ((await db.from("tenants").select("name, subdomain").eq("parent_tenant_id", t.id).eq("status", "active")).data ?? []) : [];
    return { qr, leaders, watchLive, acceptsBranches: branchesOn && !t.parent_tenant_id, parent, branches };
  });
