import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Supabase Edge Function: send-sms-alerts
 * 
 * Dispatches instant SMS alerts using Arkesel SMS API with the verified "Mene Log" sender ID.
 * - Alerts admin hotline (+233550160237) and church/branch contact numbers
 * - Handles: support tickets, new church signups, branch registrations, trial expiries, payments
 * - Supports both Supabase Database Webhooks and direct HTTP API requests.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmsPayload {
  event?: "support_ticket" | "new_signup" | "branch_signup" | "trial_expiry" | "payment_success" | "payment_failed";
  data?: Record<string, any>;
  // Support Supabase Database Webhooks
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  schema?: string;
  record?: Record<string, any>;
  old_record?: Record<string, any>;
}

// Normalize phone numbers for Arkesel dispatch
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "").trim();
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0") && digits.length === 10) {
    return "+233" + digits.slice(1);
  }
  if (digits.startsWith("233")) {
    return "+" + digits;
  }
  return digits;
}

// Dispatch SMS via Arkesel v2 API
async function dispatchArkeselSms(options: {
  recipients: string[];
  message: string;
  sender?: string;
  apiKey: string;
}) {
  const senderId = (options.sender || Deno.env.get("ARKESEL_SENDER_ID") || "Mene Log").trim().slice(0, 11);
  const validRecipients = Array.from(new Set(options.recipients.map(normalizePhone).filter(Boolean) as string[]));

  if (validRecipients.length === 0) {
    return { ok: false, error: "No valid recipient phone numbers provided." };
  }

  const endpoint = "https://sms.arkesel.com/api/v2/sms/send";
  const body = {
    sender: senderId,
    message: options.message,
    recipients: validRecipients,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || (data && data.status === "error")) {
      console.error("[send-sms-alerts] Arkesel API error:", data || response.statusText);
      return { ok: false, error: data?.message || response.statusText, data };
    }

    return { ok: true, data };
  } catch (err: any) {
    console.error("[send-sms-alerts] Fetch exception:", err);
    return { ok: false, error: err.message || "Failed to reach Arkesel API" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ARKESEL_API_KEY") || Deno.env.get("ARKESEL_SMS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing ARKESEL_API_KEY secret in Supabase Edge Function environment." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hotline = Deno.env.get("ADMIN_HOTLINE_PHONE") || "+233550160237";
    const payload: SmsPayload = await req.json().catch(() => ({}));

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
      // EVENT: Support Ticket Created or Updated
      // ------------------------------------------------------------------------
      case "support_ticket": {
        const ticketId = (eventData.id || eventData.ticket_id || "").toString().slice(0, 8);
        const churchName = eventData.church_name || "Mene:Log Church";
        const subject = eventData.subject || "Support Inquiry";
        const priority = (eventData.priority || "normal").toUpperCase();
        const churchPhone = eventData.church_phone || eventData.contact_phone;
        const customRecipients = eventData.custom_recipients || eventData.support_sms_recipients;

        // A. Dispatch to Technical Hotline (+233550160237)
        const hotlineMsg = `[Mene:Log Support] [${priority}] New ticket from ${churchName}: "${subject.slice(0, 45)}". ID: ${ticketId}`;
        const resHotline = await dispatchArkeselSms({
          recipients: [hotline],
          message: hotlineMsg,
          apiKey,
        });
        results.push({ target: "hotline", result: resHotline });

        // B. Dispatch to Church / Branch configured numbers if enabled
        const churchRecipients: string[] = [];
        if (customRecipients) {
          customRecipients.split(",").forEach((p: string) => {
            const clean = p.trim();
            if (clean) churchRecipients.push(clean);
          });
        }
        if (churchPhone && !churchRecipients.includes(churchPhone)) {
          churchRecipients.push(churchPhone);
        }

        if (churchRecipients.length > 0 && eventData.support_sms_enabled !== false) {
          const churchMsg = `[Mene:Log Support] We received your ticket "${subject.slice(0, 40)}". Our support team is attending to it. Track at menelog.site/support`;
          const resChurch = await dispatchArkeselSms({
            recipients: churchRecipients,
            message: churchMsg,
            apiKey,
          });
          results.push({ target: "church", recipients: churchRecipients, result: resChurch });
        }
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: New Church Registered
      // ------------------------------------------------------------------------
      case "new_signup": {
        const churchName = eventData.name || "New Church";
        const subdomain = eventData.subdomain || "portal";
        const tier = (eventData.tier || "trial").toUpperCase();
        const contactPhone = eventData.contact_phone || "N/A";
        const contactEmail = eventData.contact_email || "N/A";

        const alertMsg = `[Mene:Log Alert] New church registered: "${churchName}" (${subdomain}.menelog.site) on ${tier} tier. Phone: ${contactPhone}, Email: ${contactEmail}`;
        const res = await dispatchArkeselSms({
          recipients: [hotline],
          message: alertMsg,
          apiKey,
        });
        results.push({ target: "admin_signup", result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: Branch Registered
      // ------------------------------------------------------------------------
      case "branch_signup": {
        const branchName = eventData.name || "Branch Location";
        const parentChurch = eventData.parent_church_name || "Head Office";
        const leaderName = eventData.leader_name || eventData.contact_person || "Branch Pastor";
        const leaderPhone = eventData.phone || eventData.contact_phone || "N/A";
        const parentPhone = eventData.parent_contact_phone;

        const branchMsg = `[Mene:Log Branch] New branch "${branchName}" added under ${parentChurch}. Leader: ${leaderName} (${leaderPhone}).`;
        
        const recipients = [hotline];
        if (parentPhone) recipients.push(parentPhone);

        const res = await dispatchArkeselSms({
          recipients,
          message: branchMsg,
          apiKey,
        });
        results.push({ target: "branch_alert", result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: 30-Day Trial Expiration Warning
      // ------------------------------------------------------------------------
      case "trial_expiry": {
        const daysLeft = Number(eventData.days_left ?? 0);
        const churchName = eventData.church_name || "Your Church";
        const churchPhone = eventData.phone || eventData.contact_phone;

        let smsBody = "";
        if (daysLeft === 7) {
          smsBody = `[Mene:Log] Reminder: Your 30-day trial for ${churchName} ends in 7 days. Subscribe at menelog.site/billing to ensure continuous check-in.`;
        } else if (daysLeft === 3) {
          smsBody = `[Mene:Log Alert] Urgent: Your 30-day trial for ${churchName} ends in 3 days. Renew now at menelog.site/billing to prevent service interruption.`;
        } else {
          smsBody = `[Mene:Log Notice] Your 30-day trial for ${churchName} has expired today. Activate your subscription at menelog.site/billing to unlock full services.`;
        }

        const recipients = [hotline];
        if (churchPhone) recipients.push(churchPhone);

        const res = await dispatchArkeselSms({
          recipients,
          message: smsBody,
          apiKey,
        });
        results.push({ target: "trial_expiry", daysLeft, result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: Payment Success
      // ------------------------------------------------------------------------
      case "payment_success": {
        const churchName = eventData.church_name || "Church";
        const amount = Number(eventData.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
        const tier = (eventData.tier || "Platform").toUpperCase();
        const ref = eventData.reference || "N/A";
        const phone = eventData.phone || eventData.contact_phone;

        const successMsg = `[Mene:Log Billing] Payment successful! GHS ${amount} received for ${churchName} (${tier} tier). Ref: ${ref}. Thank you!`;
        const recipients = [hotline];
        if (phone) recipients.push(phone);

        const res = await dispatchArkeselSms({
          recipients,
          message: successMsg,
          apiKey,
        });
        results.push({ target: "payment_success", result: res });
        break;
      }

      // ------------------------------------------------------------------------
      // EVENT: Payment Failed
      // ------------------------------------------------------------------------
      case "payment_failed": {
        const churchName = eventData.church_name || "Church";
        const amount = Number(eventData.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
        const reason = eventData.reason || "Transaction could not be completed";
        const phone = eventData.phone || eventData.contact_phone;

        const failureMsg = `[Mene:Log Billing] Payment failed for ${churchName} (GHS ${amount}): ${reason}. Please update your payment method at menelog.site/billing`;
        const recipients = [hotline];
        if (phone) recipients.push(phone);

        const res = await dispatchArkeselSms({
          recipients,
          message: failureMsg,
          apiKey,
        });
        results.push({ target: "payment_failed", result: res });
        break;
      }

      default: {
        return new Response(
          JSON.stringify({
            error: `Unsupported or missing event type: "${eventType}". Expected one of: support_ticket, new_signup, branch_signup, trial_expiry, payment_success, payment_failed.`,
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
    console.error("[send-sms-alerts] Unhandled error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
