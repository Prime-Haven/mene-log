import {
  admin,
  audit,
  findOperator,
  hashPassword,
  normaliseUsername,
  operatorEmail,
  rateLimit,
  validOperatorPassword,
  verifyPassword,
} from "./operator.server";
import { SITE_URL } from "./site";
import { renderEmail, sendEmail } from "./messaging.server";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";
export type SupportAuthorType = "church" | "support" | "super_admin";

export type SupportStaffRecord = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  email: string;
  created_at: string;
  created_by?: string | null;
};

export type SupportTicketRecord = {
  id: string;
  tenant_id: string;
  submitted_by_user_id: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  tenant_name?: string;
  tenant_subdomain?: string;
  reply_count?: number;
  last_reply_at?: string | null;
};

export type SupportTicketReplyRecord = {
  id: string;
  ticket_id: string;
  author_type: SupportAuthorType;
  author_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  author_name?: string;
};

const SUPPORT_NOTIFICATION_EMAIL = "primehaven26@gmail.com";

/**
 * Sends an email alert to primehaven26@gmail.com when a new ticket is submitted
 * or when a church replies to an existing ticket.
 */
export async function sendSupportNotificationAlert(options: {
  type: "new_ticket" | "church_reply";
  churchName: string;
  ticketId: string;
  subject: string;
  priority: SupportTicketPriority;
  messageSnippet: string;
  submittedByEmail?: string | null;
}) {
  const isNew = options.type === "new_ticket";
  const directLink = `${SITE_URL}/support-console?ticketId=${options.ticketId}`;
  const priorityColor =
    options.priority === "urgent"
      ? "#ef4444"
      : options.priority === "high"
        ? "#f97316"
        : options.priority === "low"
          ? "#64748b"
          : "#2563eb";

  const emailSubject = `[Support Alert] ${isNew ? "New Ticket" : "Church Reply"} - ${options.churchName}: ${options.subject}`;

  const html = renderEmail({
    churchName: `Support · ${options.priority} priority`,
    brandPrimary: priorityColor,
    logoUrl: null,
    subject: `${isNew ? "New support ticket" : "Church sent a reply"}: ${options.subject}`,
    body: `Church: ${options.churchName}\nTicket ID: ${options.ticketId}${options.submittedByEmail ? `\nSubmitter: ${options.submittedByEmail}` : ""}\n\n${options.messageSnippet}`,
    ctaLabel: "Open ticket in Support Console",
    ctaUrl: directLink,
  });

  try {
    const res = await sendEmail({
      to: SUPPORT_NOTIFICATION_EMAIL,
      subject: emailSubject,
      html,
      fromName: "Mene:Log Support Alert",
      replyTo: "support@menelog.site",
    });
    if (!res.ok) {
      console.error("[support-notification] Resend alert returned error:", res.error);
    }
  } catch (err) {
    console.error("[support-notification] Failed to send support email alert:", err);
  }
}

/**
 * Sends an instant SMS alert via Arkesel to +233550160237 and the church's contact phone number
 * using the "Mene Log" sender ID whenever a support ticket is created.
 */
export async function sendSupportTicketSmsAlert(options: {
  ticketId: string;
  churchName: string;
  churchPhone?: string | null;
  tenantId?: string;
  branchId?: string | null;
  subject: string;
  priority: string;
}) {
  try {
    const { sendSms, smsConfigured } = await import("./messaging.server");
    if (!smsConfigured()) {
      console.warn("[support-sms] SMS service is not configured (missing Arkesel key)");
      return;
    }

    const hotline = "+233550160237";
    const priorityTag =
      options.priority === "urgent" || options.priority === "high"
        ? `[${options.priority.toUpperCase()}] `
        : "";
    const hotlineMsg = `[Mene:Log Support] ${priorityTag}New ticket from ${options.churchName}: "${options.subject.slice(0, 50)}". ID: ${options.ticketId.slice(0, 8)}`;

    // 1. Send SMS to prime support hotline (+233550160237) with "Mene Log" sender ID
    await sendSms({
      to: hotline,
      body: hotlineMsg,
      sender: "Mene Log",
    }).catch((e) => console.error("[support-sms] Hotline SMS dispatch failed:", e));

    // 2. Resolve church & branch recipient phone numbers and enabled status
    let smsEnabled = true;
    const recipientNumbers = new Set<string>();

    if (options.tenantId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Check branch-level overrides first if ticket is associated with a branch
      if (options.branchId) {
        const { data: branch } = await supabaseAdmin
          .from("branches")
          .select("support_sms_enabled, support_sms_recipients")
          .eq("id", options.branchId)
          .maybeSingle();

        if (branch) {
          if (branch.support_sms_enabled === false) {
            smsEnabled = false;
          } else if (branch.support_sms_recipients) {
            branch.support_sms_recipients
              .split(",")
              .map((p: string) => p.trim())
              .filter(Boolean)
              .forEach((num: string) => recipientNumbers.add(num));
          }
        }
      }

      // If branch has no custom numbers, check tenant level
      if (smsEnabled && recipientNumbers.size === 0) {
        const { data: tenant } = await supabaseAdmin
          .from("tenants")
          .select("support_sms_enabled, support_sms_recipients, settings")
          .eq("id", options.tenantId)
          .maybeSingle();

        if (tenant) {
          if (tenant.support_sms_enabled === false) {
            smsEnabled = false;
          } else if (tenant.support_sms_recipients) {
            tenant.support_sms_recipients
              .split(",")
              .map((p: string) => p.trim())
              .filter(Boolean)
              .forEach((num: string) => recipientNumbers.add(num));
          } else {
            // Also check jsonb settings if present
            const s = tenant.settings as Record<string, unknown> | null;
            if (s?.support_sms_enabled === false) {
              smsEnabled = false;
            } else if (typeof s?.support_sms_recipients === "string" && s.support_sms_recipients) {
              s.support_sms_recipients
                .split(",")
                .map((p: string) => p.trim())
                .filter(Boolean)
                .forEach((num: string) => recipientNumbers.add(num));
            }
          }
        }
      }
    }

    // Fallback to default church contact phone if no custom recipient list is defined
    if (smsEnabled && recipientNumbers.size === 0 && options.churchPhone) {
      recipientNumbers.add(options.churchPhone);
    }

    if (smsEnabled && recipientNumbers.size > 0) {
      const churchMsg = `[Mene:Log Support] We received your ticket "${options.subject.slice(0, 45)}". Our team is reviewing it. Reply at menelog.site/support`;
      
      for (const phone of recipientNumbers) {
        const clean = phone.replace(/[^\d+]/g, "");
        // Avoid sending duplicate notice to hotline
        if (clean.length >= 9 && clean !== "+233550160237" && clean !== "233550160237") {
          await sendSms({
            to: clean,
            body: churchMsg,
            sender: "Mene Log",
          }).catch((e) => console.error(`[support-sms] Dispatch to ${clean} failed:`, e));
        }
      }
    }
  } catch (err) {
    console.error("[support-sms] Error dispatching support ticket SMS:", err);
  }
}

/**
 * Dispatches test SMS messages using the 'Mene Log' sender ID to verify delivery.
 */
export async function sendTestSupportSmsAlert(options: {
  churchName: string;
  recipients: string[];
}) {
  const { sendSms, smsConfigured } = await import("./messaging.server");
  if (!smsConfigured()) {
    return { ok: false, error: "SMS service is not configured (missing Arkesel key)" };
  }

  const results: Array<{ phone: string; ok: boolean; error?: string }> = [];
  for (const rawPhone of options.recipients) {
    const cleanPhone = rawPhone.replace(/[^\d+]/g, "");
    if (cleanPhone.length < 9) {
      results.push({ phone: rawPhone, ok: false, error: "Phone number too short" });
      continue;
    }

    const body = `[Mene:Log Support] Test notification for ${options.churchName}: SMS ticket alerts are active and working properly. (Sender: Mene Log)`;
    const res = await sendSms({
      to: cleanPhone,
      body,
      sender: "Mene Log",
    });
    results.push({ phone: cleanPhone, ok: res.ok, error: res.error });
  }

  const anySuccess = results.some((r) => r.ok);
  return { ok: anySuccess, results };
}

/**
 * Sends a real-time email alert to primehaven26@gmail.com whenever a new church
 * registers or completes onboarding on Mene:Log.
 */
export async function sendNewChurchSignupAlert(options: {
  churchName: string;
  subdomain: string;
  tier: string;
  contactEmail: string;
  contactPhone?: string | null;
  adminName?: string | null;
}) {
  const directLink = `${SITE_URL}/super-admin`;
  const checkinLink = `${SITE_URL}/c/${options.subdomain}`;
  const emailSubject = `[New Church Signup] ${options.churchName} (${options.subdomain}) - ${options.tier.toUpperCase()}`;

  const safeChurchName = options.churchName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeSubdomain = options.subdomain.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeEmail = options.contactEmail.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safePhone = (options.contactPhone || "None provided").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeAdmin = (options.adminName || "Church Administrator").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;background:#0b0f19;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#f1f5f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden">
          <tr>
            <td style="background:#030712;padding:20px 24px;border-bottom:1px solid #1f2937">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em">Mene:Log Operations Alert</span>
              <span style="float:right;display:inline-block;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:9999px;background:#3b82f622;color:#3b82f6;border:1px solid #3b82f666">
                NEW SIGNUP
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px">
              <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">
                New Church Registered
              </p>
              <h2 style="margin:0 0 16px;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3">
                ${safeChurchName}
              </h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1f2937;border-radius:10px;padding:14px;margin-bottom:20px">
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px;width:120px">Check-in URL:</td>
                  <td style="padding:6px 0;color:#60a5fa;font-size:13px;font-family:monospace">${checkinLink}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Plan Package:</td>
                  <td style="padding:6px 0;color:#34d399;font-size:13px;font-weight:700;text-transform:uppercase">${options.tier}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Admin Name:</td>
                  <td style="padding:6px 0;color:#f3f4f6;font-size:13px">${safeAdmin}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Contact Email:</td>
                  <td style="padding:6px 0;color:#f3f4f6;font-size:13px">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Phone:</td>
                  <td style="padding:6px 0;color:#f3f4f6;font-size:13px">${safePhone}</td>
                </tr>
              </table>

              <div style="text-align:center">
                <a href="${directLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
                  Open Super Admin Console &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#090d16;padding:16px 24px;border-top:1px solid #1f2937;font-size:12px;color:#6b7280;text-align:center">
              Mene:Log Automated Operations Desk · primehaven26@gmail.com
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const res = await sendEmail({
      to: SUPPORT_NOTIFICATION_EMAIL,
      subject: emailSubject,
      html,
      fromName: "Mene:Log Sign-up Alert",
      replyTo: "support@menelog.site",
    });
    return res;
  } catch (err) {
    console.error("[signup alert] Failed to send new church notification email:", err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Sends an email alert to the main/head office church administrator whenever a branch
 * church registers on the check-in page.
 */
export async function sendBranchSignupAlertToHeadOffice(options: {
  headOfficeName: string;
  headOfficeEmail?: string | null;
  branchName: string;
  branchSubdomain: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
}) {
  const branchesUrl = `${SITE_URL}/branches`;
  const safeHead = options.headOfficeName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeBranch = options.branchName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeLeader = options.contactName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeEmail = options.contactEmail.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safePhone = (options.contactPhone || "Not specified").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const emailSubject = `[Branch Registration] New Branch Registered: ${options.branchName} - Action Required`;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;background:#0b0f19;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#f1f5f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden">
          <tr>
            <td style="background:#030712;padding:20px 24px;border-bottom:1px solid #1f2937">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em">${safeHead} · Branch Management</span>
              <span style="float:right;display:inline-block;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:9999px;background:#3b82f622;color:#3b82f6;border:1px solid #3b82f666">
                BRANCH REGISTRATION
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px">
              <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">
                New Branch Church Request
              </p>
              <h2 style="margin:0 0 16px;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3">
                ${safeBranch}
              </h2>
              <p style="margin:0 0 20px;color:#d1d5db;font-size:14px;line-height:1.6">
                A new branch has submitted a registration to be linked under <strong>${safeHead}</strong>. As the head church administrator, please review and approve or manage this branch in your console.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1f2937;border-radius:10px;padding:14px;margin-bottom:20px">
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px;width:130px">Branch Name:</td>
                  <td style="padding:6px 0;color:#f3f4f6;font-size:13px;font-weight:600">${safeBranch}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Proposed URL:</td>
                  <td style="padding:6px 0;color:#60a5fa;font-size:13px;font-family:monospace">menelog.site/c/${options.branchSubdomain}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Branch Leader:</td>
                  <td style="padding:6px 0;color:#f3f4f6;font-size:13px">${safeLeader}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Leader Email:</td>
                  <td style="padding:6px 0;color:#f3f4f6;font-size:13px">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9ca3af;font-size:13px">Contact Phone:</td>
                  <td style="padding:6px 0;color:#f3f4f6;font-size:13px">${safePhone}</td>
                </tr>
              </table>

              <div style="text-align:center;margin-top:24px">
                <a href="${branchesUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
                  Review & Approve Branch in Console &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#090d16;padding:16px 24px;border-top:1px solid #1f2937;font-size:12px;color:#6b7280;text-align:center">
              Mene:Log Multi-Campus Platform · ${options.headOfficeEmail || "support@menelog.site"}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // 1. Send to head office email if available
  if (options.headOfficeEmail) {
    await sendEmail({
      to: options.headOfficeEmail,
      subject: emailSubject,
      html,
      fromName: "Mene:Log Branch Network",
      replyTo: "support@menelog.site",
    }).catch((e) => console.error("[branch-alert] Head office email failed:", e));
  }

  // 2. Alert Prime Haven desk
  await sendEmail({
    to: "primehaven26@gmail.com",
    subject: `[Prime Haven Alert] ${emailSubject}`,
    html,
    fromName: "Mene:Log Branch Desk",
    replyTo: "support@menelog.site",
  }).catch((e) => console.error("[branch-alert] Prime Haven email failed:", e));
}

/**
 * Checks if user is a super admin (platform_admins) or support staff (support_staff)
 */
export async function getOperatorSupportRole(
  userId: string,
): Promise<"super_admin" | "support_staff" | null> {
  const db = await admin();
  // Check super admin
  const { data: superAdmin } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (superAdmin) return "super_admin";

  // Check support staff
  const { data: supportStaffRow } = await db
    .from("support_staff")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (supportStaffRow) return "support_staff";

  return null;
}

/**
 * Authenticates support console login (supports both super_admin and support_staff accounts)
 */
export async function authenticateSupportOperator(options: {
  username: string;
  password: string;
  ip: string;
}) {
  const username = normaliseUsername(options.username);
  const okUser = await rateLimit("support_login_user", username, 6, 900);
  const okIp = await rateLimit("support_login_ip", options.ip, 10, 900);
  if (!okUser || !okIp) {
    return { ok: false as const, error: "Too many sign-in attempts. Please wait 15 minutes." };
  }

  const operator = await findOperator(username);
  const valid = verifyPassword(options.password, operator?.app_metadata?.operator_hash);
  if (!operator || !valid) {
    if (operator) await audit(operator.id, "support.sign_in_failed", { ip: options.ip, username });
    return { ok: false as const, error: "Invalid operator username or password." };
  }

  const role = await getOperatorSupportRole(operator.id);
  if (!role) {
    await audit(operator.id, "support.access_denied_not_staff", { ip: options.ip, username });
    return {
      ok: false as const,
      error: "This operator account does not have support console permissions.",
    };
  }

  const db = await admin();
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: operator.email,
  });

  if (linkError || !link?.properties?.hashed_token) {
    return {
      ok: false as const,
      error: "Authentication service temporarily unavailable. Try again shortly.",
    };
  }

  const pubKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const { createClient } = await import("@supabase/supabase-js");
  const pub = createClient(process.env["SUPABASE_URL"]!, pubKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (pubKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${pubKey}`) {
          h.delete("Authorization");
        }
        h.set("apikey", pubKey);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data: verified, error: otpError } = await pub.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });

  if (otpError || !verified.session) {
    return { ok: false as const, error: "Could not finalize operator sign-in." };
  }

  await audit(operator.id, "support.sign_in", { ip: options.ip, role, username });

  return {
    ok: true as const,
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    role,
    userId: operator.id,
    username,
  };
}

/**
 * Generates an instant, intelligent real-time support response from the Mene:Log technical desk.
 * Executes in milliseconds with domain-specific guidance, eliminating any delays or page reloads.
 */
export function generateInstantSupportResponse(params: {
  subject: string;
  message: string;
  churchName: string;
  ticketId: string;
}): string {
  const text = `${params.subject} ${params.message}`.toLowerCase();
  const name = params.churchName || "Church Partner";
  const ref = params.ticketId.slice(0, 8);

  if (
    text.includes("qr") ||
    text.includes("scan") ||
    text.includes("camera") ||
    text.includes("check in") ||
    text.includes("check-in") ||
    text.includes("checkin") ||
    text.includes("barcode")
  ) {
    return `Hello ${name},\n\nThank you for reaching out to Mene:Log Support Desk regarding attendee check-ins.\n\nHere are quick troubleshooting steps for Sunday check-in:\n1. Ensure camera permissions are granted in the mobile browser (Safari/Chrome).\n2. If sanctuary lighting is dim or a camera is slow to focus, ushers can use the 'Manual Search & Check-in' tab at the top of the Scan screen to look up members instantly by name or phone.\n3. Both printed physical QR badges and digital barcode screenshots on member phones are supported seamlessly.\n\nOur operations engineering team has logged this ticket (Ref #${ref}) and is actively monitoring real-time system sync. A live operator will step in if badge re-issuance is needed.`;
  }

  if (
    text.includes("bill") ||
    text.includes("pay") ||
    text.includes("cedi") ||
    text.includes("ghs") ||
    text.includes("usd") ||
    text.includes("plan") ||
    text.includes("upgrade") ||
    text.includes("receipt") ||
    text.includes("invoice")
  ) {
    return `Hello ${name},\n\nThank you for contacting Prime Haven Operations & Billing.\n\nRegarding your church account billing:\n- Mene:Log automatically adapts between flat Ghana Cedis (GHS) and USD based on your location.\n- You can review your active plan quotas, next renewal date, and download official payment receipts anytime from the 'Billing' tab.\n- If you completed an offline bank or mobile money transfer, our finance desk validates transactions against references within 15–30 minutes.\n\nWe have tagged ticket #${ref} with high priority for our finance team.`;
  }

  if (
    text.includes("member") ||
    text.includes("import") ||
    text.includes("export") ||
    text.includes("csv") ||
    text.includes("excel") ||
    text.includes("upload") ||
    text.includes("phone") ||
    text.includes("contact")
  ) {
    return `Hello ${name},\n\nThank you for reaching out to Mene:Log Directory Support.\n\nFor member management and data imports:\n1. CSV bulk upload requires: First Name, Last Name, Phone, and Gender. Headers should match standard templates.\n2. You can safely export your full church dataset anytime from Members or Settings via 'Export Church Data'.\n3. Member attendance badges and individual QR codes are generated automatically upon saving.\n\nAn operations specialist has received this ticket (Ref #${ref}) and can assist if you have an unusual spreadsheet format.`;
  }

  if (
    text.includes("account") ||
    text.includes("role") ||
    text.includes("permission") ||
    text.includes("password") ||
    text.includes("usher") ||
    text.includes("leader") ||
    text.includes("login") ||
    text.includes("admin")
  ) {
    return `Hello ${name},\n\nRegarding team accounts and user permissions:\n- You can configure staff accounts under the 'Accounts' page.\n- Granular controls allow toggling specific rights (e.g. Can Scan QR, Can Manage Members, Can View Reports) for each leader or usher.\n- Two-step authentication can be enforced for administrative security.\n\nPrime Haven technical operations has logged ticket #${ref} and an operator will assist if you need account recovery or seat adjustments.`;
  }

  if (
    text.includes("follow") ||
    text.includes("absent") ||
    text.includes("absence") ||
    text.includes("miss") ||
    text.includes("visitation")
  ) {
    return `Hello ${name},\n\nRegarding absence tracking and member follow-ups:\n- Mene:Log automatically flags members who have been absent for 2 or more consecutive weeks under 'Follow-ups'.\n- Cell leaders can log pastoral call and visitation outcomes directly in the app.\n- Absence summaries can also be exported to CSV for pastoral visitation teams.\n\nOur operations team is at your service if you need custom notification rules configured.`;
  }

  if (text.includes("branch") || text.includes("campus") || text.includes("multi")) {
    return `Hello ${name},\n\nRegarding multi-branch church management:\n- You can set up campus branches under the 'Branches' tab with dedicated Branch Admin accounts.\n- The main dashboard provides both aggregate headcounts and branch-specific breakdowns.\n\nAn operator will assist you with any custom hierarchy or multi-site data routing requirements.`;
  }

  return `Hello ${name},\n\nThank you for contacting Mene:Log Live Support Desk. Your message has been received by our technical operations center.\n\nWe have logged ticket #${ref} with high priority. Our operations specialists monitor this channel in real time and are reviewing your church's setup now.\n\nPlease feel free to provide any additional details, error messages, or device types below. We are here to support your ministry!`;
}
