import { csvCell } from "@/lib/csv";
import type { consoleSnapshot, OperatorActionInput } from "@/lib/operator.functions";
import type { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export type Snapshot = Awaited<ReturnType<typeof consoleSnapshot>>;
export type Tenant = Snapshot["tenants"][number];
export type Tier = "free" | "standard" | "pro" | "premium";
export type Status = "active" | "grace" | "suspended" | "closed";
export type AuditCategory = "tenant" | "system" | "security" | "commercial";
export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEvent = {
  id: string;
  actor_user_id: string;
  actor: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  tenant_id: string | null;
  tenant_name?: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export type TrendPoint = {
  date: string;
  checkins: number;
  newChurches: number;
  activeChurches?: number;
};

export type Section =
  | "overview"
  | "churches"
  | "pending"
  | "features"
  | "revenue"
  | "growth"
  | "database"
  | "messaging"
  | "reviews"
  | "announce"
  | "operators"
  | "audit"
  | "health"
  | "account";

export type Act = ReturnType<
  typeof useMutation<{ ok: boolean; message: string } | undefined, Error, OperatorActionInput>
>;
export type Rpc = ReturnType<
  typeof useMutation<string, Error, { fn: string; args: Record<string, unknown>; done: string }>
>;

export const fmtDate = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(v)) : "—";

export const fmtDateTime = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(v),
      )
    : "—";

export const fmtBytes = (b: number) =>
  b < 1024
    ? `${b} B`
    : b < 1048576
      ? `${(b / 1024).toFixed(1)} KB`
      : b < 1073741824
        ? `${(b / 1048576).toFixed(1)} MB`
        : `${(b / 1073741824).toFixed(2)} GB`;

export const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const paymentUsd = (p: { amount_kobo: number; currency: string }) =>
  p.currency === "USD" ? p.amount_kobo / 100 : p.amount_kobo / 100 / 15.5; // conversion basis noted when GHS

export function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    toast.error("Nothing to export");
    return;
  }
  const cols = Object.keys(rows[0]!);
  const esc = csvCell;
  const csv = [
    cols.join(","),
    ...rows.map((r) =>
      cols.map((c) => esc(typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])).join(","),
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}
