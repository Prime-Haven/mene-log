import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Supabase Edge Function: send-email-alerts
 * 
 * Dispatches high-deliverability HTML emails via Resend API.
 * - Always alerts primehaven26@gmail.com for administrative events
 * - Delivers styled receipts and payment alerts to church administrators
 * - Handles: 30-day trial expiry warnings, payment success/failure, new church signups, branch registrations, support tickets
 * - Supports both direct HTTP API invocations and Supabase Database Webhooks.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  event?: "trial_expiry" | "payment_success" | "payment_failed" | "new_signup" | "branch_signup" | "support_ticket";
  data?: Record<string, any>;
  // Support Supabase Database Webhooks
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  schema?: string;
  record?: Record<string, any>;
  old_record?: Record<string, any>;
}

// Reusable email wrapper template with Mene:Log branding
function buildEmailHtml(options: {
  title: string;
  badgeText: string;
  badgeColor?: string; // hex
  preheader: string;
  contentHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}) {
  const badgeColor = options.badgeColor || "#3b82f6";
  const appUrl = Deno.env.get("APP_URL") || "https://menelog.site";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#090d16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f4f6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#090d16;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.5)">
          <!-- Header Bar -->
          <tr>
            <td style="background:#030712;padding:24px 28px;border-bottom:1px solid #1f2937">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.03em">Mene<span style="color:#3b82f6">:Log</span></span>
                    <div style="color:#9ca3af;font-size:12px;margin-top:2px">Church Attendance & Operations Platform</div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-radius:9999px;background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}66">
                      ${options.badgeText}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px 28px">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">
                ${options.preheader}
              </p>
              <h1 style="margin:0 0 20px;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3">
                ${options.title}
              </h1>

              ${options.contentHtml}

              ${
                options.ctaText && options.ctaUrl
                  ? `<div style="text-align:center;margin:32px 0 12px">
                      <a href="${options.ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(37,99,235,0.4)">
                        ${options.ctaText} &rarr;
                      </a>
                    </div>`
                  : ""
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#090d16;padding:20px 28px;border-top:1px solid #1f2937;font-size:12px;color:#6b7280;text-align:center;line-height:1.6">
              ${options.footerNote || "Mene:Log Automated Notification System · Accra, Ghana"}
              <div style="margin-top:6px">
                <a href="${appUrl}" style="color:#9ca3af;text-decoration:underline">menelog.site</a> · 
                <a href="${appUrl}/support" style="color:#9ca3af;text-decoration:underline">Technical Support</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Dispatch via Resend API
async function sendResendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  apiKey: string;
}) {
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Mene:Log Alerts <alerts@menelog.site>";
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  const payload = {
    from: options.fromName ? `${options.fromName} <${fromEmail.replace(/^.*<|>$/g, "")}>` : fromEmail,
    to: recipients,
    subject: options.subject,
    html: options.html,
    reply_to: options.replyTo || "support@menelog.site",
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("[send-email-alerts] Resend API error:", data || res.statusText);
      return { ok: false, error: data?.message || res.statusText, data };
    }

    return { ok: true, id: data?.id, data };
  } catch (err: any) {
    console.error("[send-email-alerts] Network error:", err);
    return { ok: false, error: err.message || "Failed to reach Resend API" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing RESEND_API_KEY secret in Supabase Edge Function environment." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminEmail = Deno.env.get("ADMIN_ALERT_EMAIL") || "primehaven26@gmail.com";
    const appUrl = Deno.env.get("APP_URL") || "https://menelog.site";
    const payload: EmailPayload = await req.json().catch(() => ({}));

    let eventType = payload.event;
    let eventData = payload.data || {};

    // 1. Detect if payload is a Supabase Database Webhook
    if (payload.table && payload.record) {
      if (payload.table === "support_tickets" && payload.type === "INSERT") {
        eventType = "support_ticket";
        eventData = payload.record;
      } else if (payload.table === "tenants" && payload.type === "INSERT") {
        eventType = "new_signup";
        eventData = payload.record;
      } else if (payload.table === "branches" && payload.type === "INSERT" && !payload.record.is_default) {
        eventType = "branch_signup";
        eventData = payload.record;
      }
    }

    const results: any[] = [];

    switch (eventType) {
      // ------------------------------------------------------------------------
      // EVENT: 30-Day Trial Expiration Alert (7 Days, 3 Days, and Expiry Day)
      // ------------------------------------------------------------------------
      case "trial_expiry": {
        const daysLeft = Number(eventData.days_left ?? 0);
        const churchName = eventData.church_name || "Church";
        const churchEmail = eventData.contact_email;
        const subdomain = eventData.subdomain || "portal";
        const billingUrl = `${appUrl}/billing?tenant=${subdomain}`;

        let urgencyBadge = "7 Days Left";
        let badgeColor = "#3b82f6";
        let preheader = "Trial Expiration Notice";
        let title = `Your 30-Day Mene:Log Trial Expires in 7 Days`;
        let guidanceText = `Your 30-day free trial for <strong>${churchName}</strong> will conclude in 7 days. To ensure uninterrupted service, attendance check-in, and member SMS broadcasts, please activate your plan today.`;

        if (daysLeft === 3) {
          urgencyBadge = "3 Days Left";
          badgeColor = "#f59e0b";
          preheader = "Action Required: Upcoming Expiry";
          title = `Urgent: 3 Days Remaining on Your 30-Day Trial`;
          guidanceText = `This is a reminder that only 3 days remain on the 30-day trial for <strong>${churchName}</strong>. Subscribe now to preserve continuous access for your congregation and leadership team.`;
        } else if (daysLeft <= 0) {
          urgencyBadge = "Trial Expired";
          badgeColor = "#ef4444";
          preheader = "Subscription Inactive";
          title = `Your 30-Day Trial for ${churchName} Has Ended`;
          guidanceText = `The 30-day trial period for <strong>${churchName}</strong> expired today. Your attendance records and member data remain safely preserved. Choose a package to immediately reactivate check-in and messaging.`;
        }

        const contentHtml = `
          <div style="background:#1f2937;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #374151">
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#e5e7eb">
              ${guidanceText}
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #374151;padding-top:12px">
              <tr>
                <td style="padding:4px 0;color:#9ca3af;font-size:13px;width:120px">Church:</td>
                <td style="padding:4px 0;color:#ffffff;font-size:14px;font-weight:600">${churchName}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#9ca3af;font-size:13px">Check-In URL:</td>
                <td style="padding:4px 0;color:#60a5fa;font-size:13px;font-family:monospace">${subdomain}.menelog.site</td>
              </tr>
            </table>
          </div>
        `;

        const html = buildEmailHtml({
          title,
          badgeText: urgencyBadge,
          badgeColor,
          preheader,
          contentHtml,
          ctaText: "Pay & Activate Platform",
          ctaUrl: billingUrl,
          footerNote: "Automated billing reminder sent to the registered church contact.",
        });

        // Send to Church Admin (if available) AND to primehaven26@gmail.com
        const recipients = [adminEmail];
        if (churchEmail && !recipients.includes(churchEmail)) {
          recipients.push(churchEmail);
        }

        const res = await sendResendEmail({
          to: recipients,
          subject: `[Mene:Log] ${title}`,
          html,
          apiKey,
        });
        results.push({ target: "trial_expiry", recipients, result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: Payment Successful
      // ------------------------------------------------------------------------
      case "payment_success": {
        const churchName = eventData.church_name || "Church";
        const churchEmail = eventData.contact_email;
        const amount = Number(eventData.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
        const tier = (eventData.tier || "Standard").toUpperCase();
        const reference = eventData.reference || "N/A";
        const paidAt = eventData.paid_at || new Date().toUTCString();

        const contentHtml = `
          <div style="background:#1f2937;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #374151">
            <div style="color:#10b981;font-weight:700;font-size:16px;margin-bottom:12px">
              &#10003; Payment Received Successfully
            </div>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d1d5db">
              Thank you for supporting your church's growth with Mene:Log. Your payment has been confirmed and all features on your <strong>${tier}</strong> plan remain fully unlocked.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:8px;padding:16px;border:1px solid #2d3748">
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Amount Paid:</td>
                <td style="padding:6px 0;color:#10b981;font-size:16px;font-weight:700">GHS ${amount}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Plan Tier:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:14px;font-weight:600">${tier} Package</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Church Account:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:14px">${churchName}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Transaction Ref:</td>
                <td style="padding:6px 0;color:#60a5fa;font-size:12px;font-family:monospace">${reference}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Date & Time:</td>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">${paidAt}</td>
              </tr>
            </table>
          </div>
        `;

        const html = buildEmailHtml({
          title: `Payment Receipt: GHS ${amount} Received`,
          badgeText: "Paid & Active",
          badgeColor: "#10b981",
          preheader: "Official Payment Confirmation",
          contentHtml,
          ctaText: "Open Billing Dashboard",
          ctaUrl: `${appUrl}/billing`,
          footerNote: "This receipt serves as official confirmation of your subscription payment.",
        });

        // Send to Church Administrator AND primehaven26@gmail.com
        const recipients = [adminEmail];
        if (churchEmail && !recipients.includes(churchEmail)) {
          recipients.push(churchEmail);
        }

        const res = await sendResendEmail({
          to: recipients,
          subject: `[Mene:Log Receipt] Payment Successful for ${churchName} (Ref: ${reference.slice(0, 8)})`,
          html,
          apiKey,
        });
        results.push({ target: "payment_success", recipients, result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: Payment Failed
      // ------------------------------------------------------------------------
      case "payment_failed": {
        const churchName = eventData.church_name || "Church";
        const churchEmail = eventData.contact_email;
        const amount = Number(eventData.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
        const reason = eventData.reason || "The payment transaction could not be processed by the bank.";
        const reference = eventData.reference || "N/A";

        const contentHtml = `
          <div style="background:#1f2937;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #ef444455">
            <div style="color:#ef4444;font-weight:700;font-size:16px;margin-bottom:12px">
              Payment Could Not Be Completed
            </div>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d1d5db">
              An attempt to process your payment of <strong>GHS ${amount}</strong> for <strong>${churchName}</strong> was unsuccessful.
            </p>
            <div style="background:#0f172a;border-left:4px solid #ef4444;padding:14px;border-radius:0 8px 8px 0;margin-bottom:18px;font-size:13px;color:#fca5a5">
              <strong>Decline Reason:</strong> ${reason}
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:8px;padding:14px;border:1px solid #2d3748">
              <tr>
                <td style="padding:4px 0;color:#9ca3af;font-size:13px">Reference:</td>
                <td style="padding:4px 0;color:#f87171;font-size:12px;font-family:monospace">${reference}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#9ca3af;font-size:13px">Next Steps:</td>
                <td style="padding:4px 0;color:#ffffff;font-size:13px">Retry using Mobile Money or a different Visa/Mastercard.</td>
              </tr>
            </table>
          </div>
        `;

        const html = buildEmailHtml({
          title: `Payment Attempt Failed for ${churchName}`,
          badgeText: "Payment Failed",
          badgeColor: "#ef4444",
          preheader: "Immediate Attention Required",
          contentHtml,
          ctaText: "Retry Payment Now",
          ctaUrl: `${appUrl}/billing`,
          footerNote: "Your church account remains temporarily protected to give you time to update your payment details.",
        });

        // Send to Church Administrator AND primehaven26@gmail.com
        const recipients = [adminEmail];
        if (churchEmail && !recipients.includes(churchEmail)) {
          recipients.push(churchEmail);
        }

        const res = await sendResendEmail({
          to: recipients,
          subject: `[Action Required] Payment Failed for ${churchName}`,
          html,
          apiKey,
        });
        results.push({ target: "payment_failed", recipients, result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: New Church Signup (Always to primehaven26@gmail.com)
      // ------------------------------------------------------------------------
      case "new_signup": {
        const churchName = eventData.name || "New Church";
        const subdomain = eventData.subdomain || "portal";
        const tier = (eventData.tier || "Trial").toUpperCase();
        const contactEmail = eventData.contact_email || "N/A";
        const contactPhone = eventData.contact_phone || "N/A";
        const createdAt = eventData.created_at || new Date().toUTCString();

        const contentHtml = `
          <div style="background:#1f2937;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #374151">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#e5e7eb">
              A new church organization has successfully signed up and begun their 30-day trial on Mene:Log.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:8px;padding:16px;border:1px solid #2d3748">
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px;width:130px">Church Name:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:15px;font-weight:700">${churchName}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Subdomain:</td>
                <td style="padding:6px 0;color:#60a5fa;font-size:13px;font-family:monospace">${subdomain}.menelog.site</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Package Selected:</td>
                <td style="padding:6px 0;color:#10b981;font-size:14px;font-weight:600">${tier} (30-Day Trial)</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Admin Phone:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:14px">${contactPhone}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Admin Email:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:14px">${contactEmail}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Registered At:</td>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">${createdAt}</td>
              </tr>
            </table>
          </div>
        `;

        const html = buildEmailHtml({
          title: `New Church Registration: ${churchName}`,
          badgeText: "New Church",
          badgeColor: "#8b5cf6",
          preheader: "Platform Growth Alert",
          contentHtml,
          ctaText: "Review in Platform Console",
          ctaUrl: `${appUrl}/platform`,
          footerNote: "Instant notification dispatched on church account creation.",
        });

        const res = await sendResendEmail({
          to: adminEmail,
          subject: `[Mene:Log Growth] New Church Signed Up: ${churchName} (${subdomain})`,
          html,
          apiKey,
        });
        results.push({ target: "admin_signup", recipient: adminEmail, result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: Branch Registered (To Main Church Admin & primehaven26@gmail.com)
      // ------------------------------------------------------------------------
      case "branch_signup": {
        const branchName = eventData.name || "Branch Church";
        const parentChurch = eventData.parent_church_name || "Head Office";
        const parentEmail = eventData.parent_contact_email;
        const leaderName = eventData.leader_name || eventData.contact_person || "Branch Leader";
        const leaderPhone = eventData.phone || eventData.contact_phone || "N/A";
        const leaderEmail = eventData.email || "N/A";
        const city = eventData.city || "Ghana";

        const contentHtml = `
          <div style="background:#1f2937;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #374151">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#e5e7eb">
              A new branch campus has been registered under <strong>${parentChurch}</strong>.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:8px;padding:16px;border:1px solid #2d3748">
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px;width:130px">Branch Name:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:15px;font-weight:700">${branchName} (${city})</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Parent Church:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:14px;font-weight:600">${parentChurch}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Branch Leader:</td>
                <td style="padding:6px 0;color:#60a5fa;font-size:14px">${leaderName}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px">Leader Contact:</td>
                <td style="padding:6px 0;color:#ffffff;font-size:14px">${leaderPhone} / ${leaderEmail}</td>
              </tr>
            </table>
          </div>
        `;

        const html = buildEmailHtml({
          title: `New Branch Added: ${branchName}`,
          badgeText: "Branch Campus",
          badgeColor: "#06b6d4",
          preheader: "Multi-Campus Expansion",
          contentHtml,
          ctaText: "Manage Branch Campuses",
          ctaUrl: `${appUrl}/branches`,
          footerNote: "Dispatched to head office administrators and platform operations.",
        });

        // Send to Main Church Admin AND primehaven26@gmail.com
        const recipients = [adminEmail];
        if (parentEmail && !recipients.includes(parentEmail)) {
          recipients.push(parentEmail);
        }

        const res = await sendResendEmail({
          to: recipients,
          subject: `[Mene:Log Branch] New Branch Registered: ${branchName} (${parentChurch})`,
          html,
          apiKey,
        });
        results.push({ target: "branch_signup", recipients, result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: Support Ticket Created (To primehaven26@gmail.com & Submitter)
      // ------------------------------------------------------------------------
      case "support_ticket": {
        const ticketId = (eventData.id || eventData.ticket_id || "").toString();
        const churchName = eventData.church_name || "Church";
        const subject = eventData.subject || "Support Inquiry";
        const priority = (eventData.priority || "normal").toUpperCase();
        const description = eventData.description || eventData.body || "No additional description provided.";
        const submitterEmail = eventData.submitted_by_email || eventData.contact_email;

        const contentHtml = `
          <div style="background:#1f2937;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #374151">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:8px;padding:16px;margin-bottom:18px;border:1px solid #2d3748">
              <tr>
                <td style="padding:5px 0;color:#9ca3af;font-size:13px;width:120px">Church:</td>
                <td style="padding:5px 0;color:#ffffff;font-size:14px;font-weight:600">${churchName}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;color:#9ca3af;font-size:13px">Ticket ID:</td>
                <td style="padding:5px 0;color:#60a5fa;font-size:13px;font-family:monospace">${ticketId}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;color:#9ca3af;font-size:13px">Priority:</td>
                <td style="padding:5px 0;color:#f59e0b;font-size:13px;font-weight:700">${priority}</td>
              </tr>
              ${
                submitterEmail
                  ? `<tr>
                      <td style="padding:5px 0;color:#9ca3af;font-size:13px">Submitter:</td>
                      <td style="padding:5px 0;color:#ffffff;font-size:13px">${submitterEmail}</td>
                    </tr>`
                  : ""
              }
            </table>

            <div style="background:#0f172a;border-left:4px solid #3b82f6;padding:16px;border-radius:0 8px 8px 0;color:#e2e8f0;font-size:14px;line-height:1.6">
              ${description}
            </div>
          </div>
        `;

        const html = buildEmailHtml({
          title: `Support Ticket: ${subject}`,
          badgeText: `${priority} Priority`,
          badgeColor: priority === "URGENT" ? "#ef4444" : "#3b82f6",
          preheader: "New Support Inquiry",
          contentHtml,
          ctaText: "Open Ticket in Console",
          ctaUrl: `${appUrl}/support`,
          footerNote: "Dispatched to primehaven26@gmail.com technical hotline.",
        });

        const res = await sendResendEmail({
          to: adminEmail,
          subject: `[Mene:Log Support] [${priority}] Ticket from ${churchName}: "${subject.slice(0, 45)}"`,
          html,
          apiKey,
        });
        results.push({ target: "support_ticket", recipient: adminEmail, result: res });
        break;
      }

      default: {
        return new Response(
          JSON.stringify({
            error: `Unsupported or missing event type: "${eventType}". Expected one of: trial_expiry, payment_success, payment_failed, new_signup, branch_signup, support_ticket.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, event: eventType, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[send-email-alerts] Unhandled error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
