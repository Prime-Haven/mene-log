import { sendEmail } from "./messaging.server";
import { SITE_URL } from "./site";

const OPERATOR_ALERT_EMAIL = "primehaven26@gmail.com";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Checks for tenants on active 30-day trials approaching or reaching expiry
 * (7 days before, 3 days before, and on expiry) and sends actionable renewal alerts.
 * Idempotently tracked via audit_events so each notice is sent at most once per milestone.
 */
export async function checkAndSendTrialExpiryAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<{ checked: number; sent: number }> {
  const { data: tenants, error } = await admin
    .from("tenants")
    .select("id, name, subdomain, tier, contact_email, trial_ends_at, status")
    .eq("status", "active")
    .neq("tier", "free")
    .not("trial_ends_at", "is", null);

  if (error || !tenants) {
    console.error("[trial-alerts] Failed to fetch tenants for trial checks:", error?.message);
    return { checked: 0, sent: 0 };
  }

  let sentCount = 0;
  const now = Date.now();

  for (const t of tenants) {
    if (!t.trial_ends_at || !t.contact_email) continue;

    // Check if the church has already completed a payment
    const { data: payments } = await admin
      .from("payments")
      .select("id")
      .eq("tenant_id", t.id)
      .eq("status", "success")
      .limit(1);

    if (payments && payments.length > 0) {
      // Already a paid customer
      continue;
    }

    const trialEndMs = new Date(t.trial_ends_at).getTime();
    const diffHours = (trialEndMs - now) / (3600 * 1000);
    const diffDays = Math.ceil(diffHours / 24);

    let milestone: "7d" | "3d" | "expired" | null = null;
    if (diffDays === 7 || (diffHours <= 7 * 24 && diffHours > 6 * 24)) {
      milestone = "7d";
    } else if (diffDays === 3 || (diffHours <= 3 * 24 && diffHours > 2 * 24)) {
      milestone = "3d";
    } else if (diffHours <= 0 && diffHours >= -24) {
      milestone = "expired";
    }

    if (!milestone) continue;

    const actionKey = `trial_alert.${milestone}`;

    // Verify if this milestone has already been dispatched
    const { data: existingAudit } = await admin
      .from("audit_events")
      .select("id")
      .eq("tenant_id", t.id)
      .eq("action", actionKey)
      .limit(1);

    if (existingAudit && existingAudit.length > 0) {
      continue;
    }

    // Prepare email content
    const safeChurchName = escapeHtml(t.name);
    const billingLink = `${SITE_URL}/billing`;

    let subject = "";
    let headline = "";
    let messageBody = "";
    let badgeText = "";
    let badgeColor = "#3b82f6";

    if (milestone === "7d") {
      subject = `[Mene:Log] 7 Days Remaining on Your 30-Day Free Trial - ${t.name}`;
      headline = "7 Days Left on Your 30-Day Trial";
      badgeText = "7 DAYS LEFT";
      badgeColor = "#3b82f6";
      messageBody = `Your church's 30-day trial of Mene:Log will conclude in one week. All your member directories, check-in records, and service attendances are saved and active. To ensure uninterrupted service, select and activate your preferred package today.`;
    } else if (milestone === "3d") {
      subject = `[Mene:Log Action Required] 3 Days Left on Your Trial - ${t.name}`;
      headline = "3 Days Left on Your 30-Day Trial";
      badgeText = "ACTION REQUIRED · 3 DAYS";
      badgeColor = "#f59e0b";
      messageBody = `Your 30-day trial for ${safeChurchName} is ending in 3 days. Activate your package now so your leaders and members can continue checking in smoothly on Sunday.`;
    } else {
      subject = `[Mene:Log] Your 30-Day Trial Has Concluded - Activate Your Account`;
      headline = "Your 30-Day Trial Has Concluded";
      badgeText = "TRIAL EXPIRED";
      badgeColor = "#ef4444";
      messageBody = `Your 30-day free trial has come to an end. All your church records and attendance logs remain completely safe and preserved. Choose a package to immediately re-enable all premium capabilities.`;
    }

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
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em">Mene:Log Church Management</span>
              <span style="float:right;display:inline-block;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:9999px;background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}66">
                ${badgeText}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">
                Subscription Status Notice
              </p>
              <h2 style="margin:0 0 16px;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3">
                ${headline}
              </h2>
              <p style="margin:0 0 20px;color:#d1d5db;font-size:15px;line-height:1.6">
                Hello <strong>${safeChurchName}</strong> team,
              </p>
              <p style="margin:0 0 24px;color:#d1d5db;font-size:15px;line-height:1.6">
                ${messageBody}
              </p>

              <div style="background:#1f2937;border-radius:12px;padding:16px 20px;margin-bottom:28px;border:1px solid #374151">
                <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f3f4f6">What stays intact?</p>
                <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5">
                  ✓ Full member registry and phone contacts<br/>
                  ✓ Historic service attendances and dates<br/>
                  ✓ Custom check-in URL: menelog.site/c/${escapeHtml(t.subdomain)}
                </p>
              </div>

              <div style="text-align:center;margin:32px 0 16px">
                <a href="${billingLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px">
                  Choose Plan & Continue Using Mene:Log &rarr;
                </a>
              </div>
              <p style="text-align:center;margin:0;font-size:12px;color:#6b7280">
                Supports Mobile Money (MTN, Telecel, AT) and Visa/Mastercard.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#090d16;padding:16px 24px;border-top:1px solid #1f2937;font-size:12px;color:#6b7280;text-align:center">
              Mene:Log Platform Services · Need assistance? Reply to support@menelog.site
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send to church contact email
    const emailResult = await sendEmail({
      to: t.contact_email,
      subject,
      html,
      fromName: "Mene:Log Subscriptions",
      replyTo: "support@menelog.site",
    });

    if (emailResult.ok) {
      sentCount++;
      // Log audit record
      await admin.rpc("log_audit", {
        _tenant: t.id,
        _action: actionKey,
        _target: t.subdomain,
        _detail: { diffDays, milestone, contact_email: t.contact_email },
      });

      // Also alert Prime Haven operator desk
      await sendEmail({
        to: OPERATOR_ALERT_EMAIL,
        subject: `[Operator Notice] ${subject}`,
        html,
        fromName: "Mene:Log Subscriptions Desk",
        replyTo: "support@menelog.site",
      }).catch((e) => console.error("[trial-alerts] Operator copy failed:", e));
    } else {
      console.error(`[trial-alerts] Failed to send ${milestone} alert to ${t.contact_email}:`, emailResult.error);
    }
  }

  return { checked: tenants.length, sent: sentCount };
}
