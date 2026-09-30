// Server-only helpers for the Prime Haven operator console.
import bcrypt from "bcryptjs";

export const OPERATOR_DOMAIN = "ops.menelog.site";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export function normaliseUsername(value: string) {
  return value.trim().toLowerCase();
}

export function operatorEmail(username: string) {
  return `${normaliseUsername(username)}@${OPERATOR_DOMAIN}`;
}

type OperatorUser = {
  id: string;
  email: string;
  last_sign_in_at: string | null;
  created_at: string;
  app_metadata: { operator?: boolean; operator_username?: string; operator_hash?: string };
};

export async function listOperatorUsers(): Promise<OperatorUser[]> {
  const db = await admin();
  const out: OperatorUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("Could not load operator accounts");
    const users = (data?.users ?? []) as OperatorUser[];
    out.push(...users.filter((u) => u.app_metadata?.operator === true));
    if (users.length < 200) break;
  }
  return out;
}

export async function findOperator(username: string) {
  const email = operatorEmail(username);
  return (await listOperatorUsers()).find((u) => u.email?.toLowerCase() === email) ?? null;
}

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string | undefined) {
  // Always run a comparison so response timing does not reveal unknown usernames.
  const fallback = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.0Q7F8Qzv2t1iYfQy0mN8m3mZ0Kq6";
  return bcrypt.compareSync(password, hash || fallback) && !!hash;
}

export async function rateLimit(
  bucket: string,
  identifier: string,
  max: number,
  windowSeconds: number,
) {
  const db = await admin();
  const { data, error } = await db.rpc("check_rate_limit", {
    _bucket: bucket,
    _identifier: identifier,
    _max: max,
    _window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}

export async function audit(
  actor: string,
  action: string,
  detail: Record<string, unknown> = {},
  tenantId: string | null = null,
  options?: {
    category?: "tenant" | "system" | "security" | "commercial";
    severity?: "info" | "warning" | "critical";
    actorUsername?: string;
    tenantName?: string;
  },
) {
  const db = await admin();

  // Smart category inference
  let category = options?.category;
  if (!category) {
    if (action.startsWith("tenant.") || action.startsWith("branch.")) category = "tenant";
    else if (action.startsWith("operator.") || action.includes("password") || action.includes("auth")) category = "security";
    else if (action.includes("pricing") || action.includes("coupon") || action.includes("payment") || action.includes("billing")) category = "commercial";
    else category = "system";
  }

  // Smart severity inference
  let severity = options?.severity;
  if (!severity) {
    if (
      action.includes("purged") ||
      action.includes("delete") ||
      action.includes("removed") ||
      action.includes("maintenance_enabled")
    ) {
      severity = "critical";
    } else if (
      action.includes("warning") ||
      action.includes("reject") ||
      action.includes("flag") ||
      action.includes("reset") ||
      action.includes("lockdown") ||
      action.includes("broadcast")
    ) {
      severity = "warning";
    } else {
      severity = "info";
    }
  }

  // Operator username resolution
  let actorUsername = options?.actorUsername;
  if (!actorUsername) {
    try {
      const ops = await listOperatorUsers();
      const op = ops.find((o) => o.id === actor);
      actorUsername = op?.app_metadata?.operator_username ?? op?.email?.split("@")[0] ?? "operator";
    } catch {
      actorUsername = "operator";
    }
  }

  // Tenant name resolution
  let tenantName = options?.tenantName;
  if (tenantId && !tenantName) {
    try {
      const { data } = await db.from("tenants").select("name").eq("id", tenantId).maybeSingle();
      if (data?.name) tenantName = data.name;
    } catch {
      // best-effort
    }
  }

  await db.from("platform_audit_events").insert({
    actor_user_id: actor,
    actor_username: actorUsername,
    action,
    category,
    severity,
    tenant_id: tenantId,
    tenant_name: tenantName,
    detail,
  });
}

export function validOperatorPassword(value: string) {
  return value.length >= 8 && value.length <= 72;
}
