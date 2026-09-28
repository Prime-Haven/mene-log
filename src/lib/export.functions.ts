import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EXPORTS = {
  members:
    "id, full_name, phone, email, date_of_birth, gender, marital_status, residential_area, occupation, education_level, status, joined_on, invited_by_leader_id, created_at",
  services: "id, name, service_date, is_open, created_at",
  attendance: "id, service_id, member_id, method, recorded_at",
  leaders: "id, full_name, email, phone, location, status, created_at",
  followups:
    "id, member_id, status, assigned_leader_id, note, next_contact_on, source, created_at, updated_at",
} as const;
const TABLE: Record<keyof typeof EXPORTS, string> = {
  members: "members",
  services: "services",
  attendance: "attendance",
  leaders: "leader_profiles",
  followups: "member_followups",
};

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  const cell = (v: unknown) => {
    let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join(
    "\n",
  );
}

/** Owner-only full church export as a ZIP of CSV files (base64). */
export const exportChurchData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: isOwner } = await sb.rpc("has_tenant_role", {
      _tenant: data.tenantId,
      _roles: ["owner"],
    });
    if (isOwner !== true) throw new Error("Only the church owner can export all data.");
    const { data: allowed } = await sb.rpc("check_rate_limit", {
      _bucket: "church_export",
      _identifier: `${context.userId}:${data.tenantId}`,
      _max: 3,
      _window_seconds: 3600,
    });
    if (allowed !== true)
      throw new Error("Export limit reached (3 per hour). Please try again later.");

    const { zipSync, strToU8 } = await import("fflate");
    const files: Record<string, Uint8Array> = {};
    const counts: Record<string, number> = {};
    for (const [name, cols] of Object.entries(EXPORTS) as Array<[keyof typeof EXPORTS, string]>) {
      const rows: Array<Record<string, unknown>> = [];
      for (let from = 0; from < 200000; from += 1000) {
        const { data: page, error } = await sb
          .from(TABLE[name] as "members")
          .select(cols)
          .eq("tenant_id", data.tenantId)
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(`Could not read ${name}.`);
        rows.push(...((page ?? []) as unknown as Array<Record<string, unknown>>));
        if (!page || page.length < 1000) break;
      }
      counts[name] = rows.length;
      files[`${name}.csv`] = strToU8(toCsv(rows, cols.split(", ")));
    }
    const zip = zipSync(files, { level: 6 });
    await sb.rpc("log_audit", {
      _tenant: data.tenantId,
      _action: "data.exported",
      _target: "full",
      _detail: counts,
      _ip: "",
      _actor: context.userId,
    });
    return { base64: Buffer.from(zip).toString("base64"), counts };
  });
