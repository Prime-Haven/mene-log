import { renderEmail, sendEmail } from "./messaging.server";
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

    void safeChurchName;
    const html = renderEmail({
      churchName: t.name,
      brandPrimary: badgeColor,
      logoUrl: null,
      subject: headline,
      body: `Hello ${t.name} team,\n\n${messageBody.replace(safeChurchName, t.name)}\n\nWhat stays intact:\n✓ Full member registry and phone contacts\n✓ Historic service attendances and dates\n✓ Your check-in address: menelog.site/c/${t.subdomain}\n\nPay with Mobile Money (MTN, Telecel, AT) or Visa/Mastercard.`,
      ctaLabel: "Choose a plan",
      ctaUrl: billingLink,
    });

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
