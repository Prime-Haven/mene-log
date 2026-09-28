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
import { sendEmail } from "./messaging.server";

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

  const safeChurchName = options.churchName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeSubject = options.subject.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeSnippet = options.messageSnippet
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

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
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em">Mene:Log Support System</span>
              <span style="float:right;display:inline-block;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:9999px;background:${priorityColor}22;color:${priorityColor};border:1px solid ${priorityColor}66">
                ${options.priority}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px">
              <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">
                ${isNew ? "New Support Ticket Submitted" : "Church Sent a Reply"}
              </p>
              <h2 style="margin:0 0 16px;color:#ffffff;font-size:20px;font-weight:700;line-height:1.3">
                ${safeSubject}
              </h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1f2937;border-radius:10px;padding:14px;margin-bottom:20px">
                <tr>
                  <td style="padding:4px 0;color:#9ca3af;font-size:13px;width:110px">Church:</td>
                  <td style="padding:4px 0;color:#f3f4f6;font-size:14px;font-weight:600">${safeChurchName}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#9ca3af;font-size:13px">Ticket ID:</td>
                  <td style="padding:4px 0;color:#60a5fa;font-size:12px;font-family:monospace">${options.ticketId}</td>
                </tr>
                ${
                  options.submittedByEmail
                    ? `<tr>
                  <td style="padding:4px 0;color:#9ca3af;font-size:13px">Submitter:</td>
                  <td style="padding:4px 0;color:#f3f4f6;font-size:13px">${options.submittedByEmail}</td>
                </tr>`
                    : ""
                }
              </table>

              <div style="background:#0f172a;border-left:3px solid #3b82f6;padding:16px;border-radius:0 8px 8px 0;color:#e2e8f0;font-size:14px;line-height:1.6;margin-bottom:24px">
                ${safeSnippet}
              </div>

              <div style="text-align:center">
                <a href="${directLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
                  Open Ticket in Support Console &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#090d16;padding:16px 24px;border-top:1px solid #1f2937;font-size:12px;color:#6b7280;text-align:center">
              Alert routed directly to support operations · General outgoing reply-to remains support@menelog.site
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
