/**
 * The queue worker. Server-only. Claims queued messages with the privileged
 * client (the queue tables are never writable from the browser), sends each
 * one through its provider, and records the outcome with retry backoff.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SendResult } from "@/lib/messaging.server";
import {
  emailConfigured,
  renderEmail,
  sendEmail,
  sendSms,
  smsConfigured,
} from "@/lib/messaging.server";

type Claimed = {
  id: string;
  tenant_id: string;
  channel: "email" | "sms";
  recipient: string;
  subject: string | null;
  body: string;
  church_name: string;
  reply_to: string | null;
  sms_sender: string | null;
  brand_primary: string;
  logo_path: string | null;
};

async function logoUrlFor(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from("tenant-branding")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  return error ? null : data.signedUrl;
}

export async function processQueue(limit = 100): Promise<{ sent: number; failed: number }> {
  if (!emailConfigured() && !smsConfigured()) return { sent: 0, failed: 0 };

  const { data, error } = await supabaseAdmin.rpc("claim_pending_messages", { p_limit: limit });
  if (error || !data) {
    if (error) console.error("[queue] could not claim messages", error.message);
    return { sent: 0, failed: 0 };
  }

  const rows = data as unknown as Claimed[];
  const logoCache = new Map<string, string | null>();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    let result: SendResult;

    if (row.channel === "email") {
      if (!emailConfigured()) {
        result = { ok: false, error: "Email is not configured yet" };
      } else {
        if (!logoCache.has(row.tenant_id)) {
          logoCache.set(row.tenant_id, await logoUrlFor(row.logo_path));
        }
        result = await sendEmail({
          to: row.recipient,
          subject: row.subject ?? row.church_name,
          fromName: row.church_name,
          replyTo: row.reply_to,
          html: renderEmail({
            churchName: row.church_name,
            brandPrimary: row.brand_primary,
            logoUrl: logoCache.get(row.tenant_id) ?? null,
            subject: row.subject ?? row.church_name,
            body: row.body,
          }),
        });
      }
    } else if (row.channel === "whatsapp") {
      result = await sendWhatsapp({ to: row.recipient, body: `${row.church_name}: ${row.body}` });
    } else {
      result = smsConfigured()
        ? await sendSms({ to: row.recipient, body: row.body, sender: row.sms_sender })
        : { ok: false, error: "Text messaging is not configured yet" };
    }

    if (result.ok) sent += 1;
    else failed += 1;

    await supabaseAdmin.rpc("mark_message_result", {
      p_id: row.id,
      p_ok: result.ok,
      p_provider_id: (result.providerId ?? null) as string,
      p_error: (result.error ?? null) as string,
    });
  }

  return { sent, failed };
}

/** One branded email sent immediately, outside the queue (staff invitations). */
export async function sendBrandedEmailNow(options: {
  tenantId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) return { ok: false, error: "Email is not configured yet" };
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("name, brand_primary, logo_path, reply_to_email")
    .eq("id", options.tenantId)
    .single();
  if (!tenant) return { ok: false, error: "Church not found" };

  const result = await sendEmail({
    to: options.to,
    subject: options.subject,
    fromName: tenant.name,
    replyTo: tenant.reply_to_email ?? null,
    html: renderEmail({
      churchName: tenant.name,
      brandPrimary: tenant.brand_primary,
      logoUrl: await logoUrlFor(tenant.logo_path),
      subject: options.subject,
      body: options.body,
    }),
  });
  return { ok: result.ok, ...(result.error ? { error: result.error } : {}) };
}
