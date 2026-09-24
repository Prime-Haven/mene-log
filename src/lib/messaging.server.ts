/**
 * Provider adapters. Server-only: keys never reach the browser.
 * Email goes through Resend, text messages through Arkesel. Until the keys are
 * saved the whole messaging engine reports itself as not configured and sends
 * nothing, so nothing is silently lost.
 */

export type Channel = "email" | "sms";

export type SendResult = {
  ok: boolean;
  providerId?: string | undefined;
  error?: string | undefined;
};

export function emailConfigured(): boolean {
  return !!process.env["MENELOG_RESEND_API_KEY"];
}

export function smsConfigured(): boolean {
  return !!process.env["ARKESEL_API_KEY"];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SITE = "https://menelog.site";

/** Mene:Log branded HTML wrapper, carrying the church's own name, logo and accent colour. */
export function renderEmail(options: {
  churchName: string;
  brandPrimary: string;
  logoUrl: string | null;
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const colour = /^#[0-9a-f]{6}$/i.test(options.brandPrimary) ? options.brandPrimary : "#3b82f6";
  const paragraphs = options.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.65">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const churchLogo = options.logoUrl
    ? `<img src="${escapeHtml(options.logoUrl)}" alt="" width="44" height="44" style="border-radius:10px;display:block;margin:0 0 14px">`
    : "";
  const cta = options.ctaLabel && options.ctaUrl && /^https:\/\//.test(options.ctaUrl)
    ? `<a href="${escapeHtml(options.ctaUrl)}" style="display:inline-block;background:${colour};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;margin-top:6px">${escapeHtml(options.ctaLabel)}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#ffffff;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #e8ecf1;border-radius:16px;overflow:hidden">
<tr><td style="background:#0b0f19;padding:22px 28px"><img src="${SITE}/favicon.png" width="34" height="34" alt="Mene:Log" style="vertical-align:middle;border-radius:8px"/>
<span style="color:#ffffff;font-size:19px;font-weight:700;vertical-align:middle;margin-left:10px">Mene:Log</span></td></tr>
<tr><td style="background:${colour};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 6px">${churchLogo}
<p style="margin:0;color:${colour};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${escapeHtml(options.churchName)}</p>
<h1 style="margin:8px 0 18px;font-size:24px;line-height:1.25;color:#0f172a">${escapeHtml(options.subject)}</h1></td></tr>
<tr><td style="padding:0 28px 26px;font-size:15px;color:#334155">${paragraphs}${cta}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e8ecf1;font-size:12px;color:#94a3b8;text-align:center">
Sent by ${escapeHtml(options.churchName)} · powered by <a href="${SITE}" style="color:#3b82f6;text-decoration:none">Mene:Log</a></td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  replyTo: string | null;
}): Promise<SendResult> {
  const key = process.env["MENELOG_RESEND_API_KEY"];
  if (!key) return { ok: false, error: "Email is not configured yet" };
  const from = process.env["MENELOG_EMAIL_FROM"] ?? "Mene:Log <no-reply@menelog.site>";
  const safeName = options.fromName.replace(/[<>"\n\r]/g, "").slice(0, 60) || "Mene:Log";
  const sender = from.includes("<") ? from : `${safeName} <${from}>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`[messaging] Resend failed [${response.status}]: ${text}`);
      let detail = "";
      try { detail = (JSON.parse(text) as { message?: string }).message ?? ""; } catch { detail = ""; }
      return { ok: false, error: `Email provider error ${response.status}${detail ? `: ${detail}` : ""}` };
    }
    let providerId: string | undefined;
    try {
      providerId = (JSON.parse(text) as { id?: string }).id;
    } catch {
      providerId = undefined;
    }
    return { ok: true, providerId };
  } catch (error) {
    console.error("[messaging] Resend request threw", error);
    return { ok: false, error: "Could not reach the email provider" };
  }
}

export async function sendSms(options: {
  to: string;
  body: string;
  sender: string | null;
}): Promise<SendResult> {
  const key = process.env["ARKESEL_API_KEY"];
  if (!key) return { ok: false, error: "Text messaging is not configured yet" };
  const sender = (options.sender ?? process.env["ARKESEL_SENDER_ID"] ?? "MeneLog")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .slice(0, 11);

  try {
    const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({
        sender,
        message: options.body.slice(0, 480),
        recipients: [options.to.replace(/[^\d+]/g, "")],
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`[messaging] Arkesel failed [${response.status}]: ${text}`);
      return { ok: false, error: `Text provider error ${response.status}` };
    }
    let providerId: string | undefined;
    let status: string | undefined;
    try {
      const parsed = JSON.parse(text) as { status?: string; data?: Array<{ id?: string }> };
      status = parsed.status;
      providerId = parsed.data?.[0]?.id;
    } catch {
      providerId = undefined;
    }
    if (status && status !== "success") {
      console.error(`[messaging] Arkesel rejected the send: ${text}`);
      return { ok: false, error: "The text provider rejected this message" };
    }
    return { ok: true, providerId };
  } catch (error) {
    console.error("[messaging] Arkesel request threw", error);
    return { ok: false, error: "Could not reach the text provider" };
  }
}
