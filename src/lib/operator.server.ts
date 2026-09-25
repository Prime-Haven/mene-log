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

export async function rateLimit(bucket: string, identifier: string, max: number, windowSeconds: number) {
  const db = await admin();
  const { data, error } = await db.rpc("check_rate_limit", {
    _bucket: bucket, _identifier: identifier, _max: max, _window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}

export async function audit(actor: string, action: string, detail: Record<string, unknown> = {}, tenantId: string | null = null) {
  const db = await admin();
  await db.from("platform_audit_events").insert({ actor_user_id: actor, action, detail, tenant_id: tenantId });
}

export function validOperatorPassword(value: string) {
  return value.length >= 8 && value.length <= 72;
}
