import { sendEmail } from "./messaging.server";
import { intervalFromReference, planLabel } from "./pricing";

const SITE = "https://mene.lovable.app";

function esc(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export type ReceiptInput = {
  to: string;
  churchName: string;
  reference: string;
  kind: "subscription" | "space";
  tier?: string | null;
  slots?: number | null;
  amountMinor: number;
  currency: string;
  channel?: string | null;
  paidAt: string;
  renewsOn?: string | null;
};

export function receiptHtml(r: ReceiptInput) {
  const item =
    r.kind === "space"
      ? `Extra member space (+${(r.slots ?? 0).toLocaleString()} members)`
      : `${planLabel(r.tier)} plan · ${intervalFromReference(r.reference) === "yearly" ? "Yearly" : "Monthly"}`;
  const method = r.channel === "mobile_money" ? "Mobile money" : r.channel ? "Card" : "—";
  const date = new Date(r.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const row = (k: string, v: string) =>
    `<tr><td style="padding:8px 0;color:#64748b;font-size:14px">${k}</td><td style="padding:8px 0;text-align:right;font-size:14px;color:#0f172a;font-weight:600">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border:1px solid #e8ecf1;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b0f19;padding:22px 28px"><img src="${SITE}/favicon.png" width="36" height="36" alt="Mene:Log" style="vertical-align:middle;border-radius:8px"/>
<span style="color:#ffffff;font-size:20px;font-weight:700;vertical-align:middle;margin-left:10px">Mene:Log</span></td></tr>
<tr><td style="padding:28px 28px 6px"><p style="margin:0;color:#3b82f6;font-size:12px;font-weight:700;letter-spacing:2px">PAYMENT RECEIPT</p>
<h1 style="margin:8px 0 4px;font-size:30px;color:#0f172a">${esc(money(r.amountMinor, r.currency))}</h1>
<p style="margin:0;color:#64748b;font-size:14px">Paid by ${esc(r.churchName)} on ${esc(date)}</p></td></tr>
<tr><td style="padding:16px 28px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8ecf1">
${row("Receipt number", esc(r.reference))}${row("Church", esc(r.churchName))}${row("Item", esc(item))}${row("Payment method", method)}${row("Date paid", esc(date))}
${r.renewsOn ? row("Next renewal", esc(new Date(r.renewsOn).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))) : ""}
<tr><td style="padding:12px 0;border-top:1px solid #e8ecf1;font-size:15px;font-weight:700;color:#0f172a">Total paid</td><td style="padding:12px 0;border-top:1px solid #e8ecf1;text-align:right;font-size:15px;font-weight:700;color:#0f172a">${esc(money(r.amountMinor, r.currency))}</td></tr>
</table></td></tr>
<tr><td style="padding:8px 28px 28px"><a href="${SITE}/billing" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">View billing</a></td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e8ecf1;font-size:12px;color:#94a3b8;text-align:center">Thank you for choosing Mene:Log. Keep this email for your records.</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendReceipt(r: ReceiptInput) {
  return sendEmail({
    to: r.to,
    subject: `Your Mene:Log receipt · ${r.reference}`,
    html: receiptHtml(r),
    fromName: "Mene:Log",
    replyTo: null,
  });
}

/** Sends a receipt once per payment reference. Uses the service client; call only after verifying the payment. */
export async function sendReceiptOnce(
  admin: any,
  opts: { tenantId: string; reference: string; to: string | null | undefined; kind: "subscription" | "space"; amountMinor: number; currency: string; channel?: string | null; paidAt: string; slots?: number | null; tier?: string | null },
) {
  if (!opts.to) return;
  const { data: already } = await admin
    .from("audit_events")
    .select("id")
    .eq("tenant_id", opts.tenantId)
    .eq("action", "receipt.sent")
    .eq("target", opts.reference)
    .limit(1);
  if (already && already.length) return;
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", opts.tenantId).maybeSingle();
  const { data: sub } = await admin.from("subscriptions").select("period_end").eq("tenant_id", opts.tenantId).maybeSingle();
  const result = await sendReceipt({
    ...opts,
    to: opts.to,
    churchName: tenant?.name ?? "Your church",
    renewsOn: opts.kind === "subscription" ? sub?.period_end ?? null : null,
  });
  if (result.ok) {
    await admin.rpc("log_audit", { _tenant: opts.tenantId, _action: "receipt.sent", _target: opts.reference, _detail: { to: opts.to } });
  } else {
    console.error("receipt_send_failed", result.error);
  }
}
