import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { intervalFromReference } from "@/lib/pricing";
import { sendReceiptOnce } from "@/lib/receipt.server";

/**
 * Paystack webhook. Every request is verified with an HMAC-SHA512 signature over
 * the raw body before any database write happens. Unverified requests are dropped.
 */
export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const provided = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(raw).digest("hex");

        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: {
          event?: string;
          data?: {
            reference?: string;
            status?: string;
            channel?: string;
            paid_at?: string;
            amount?: number;
            currency?: string;
            customer?: { email?: string };
            metadata?: { tenant_id?: string; tier?: string; kind?: string; slots?: number; charge_currency?: string; usd_cents?: number; rate?: number };
          };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        if (event.event !== "charge.success" || !event.data?.reference) {
          return new Response("ignored");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (event.data.metadata?.kind === "space") {
          const { error } = await supabaseAdmin.rpc("apply_space_purchase", {
            p_reference: event.data.reference,
            p_amount: event.data.amount,
          });
          if (error) {
            console.error("paystack_webhook_apply_space_failed", error.message);
            return new Response("Could not record space purchase", { status: 500 });
          }
          if (event.data.metadata?.tenant_id) {
            await sendReceiptOnce(supabaseAdmin, {
              tenantId: event.data.metadata.tenant_id,
              reference: event.data.reference,
              to: event.data.customer?.email,
              kind: "space",
              slots: event.data.metadata.slots ?? null,
              amountMinor: event.data.amount ?? 0,
              currency: event.data.currency ?? "USD",
              channel: event.data.channel ?? null,
              paidAt: event.data.paid_at ?? new Date().toISOString(),
            });
          }
          return new Response("ok");
        }

        // Ghana renewals are charged in GHS at the flat rate; the stored price is in USD.
        let amount = event.data.amount;
        if (typeof amount === "number" && event.data.currency === "GHS") {
          // Metadata was set by our server at checkout (event is signature-verified).
          const usdCents = Number(event.data.metadata?.usd_cents);
          const rate = Number(event.data.metadata?.rate);
          if (!Number.isFinite(usdCents) || !Number.isFinite(rate) || rate <= 0) {
            return new Response("Amount mismatch", { status: 400 });
          }
          if (Math.abs(amount - Math.round(usdCents * rate)) > 1) {
            return new Response("Amount mismatch", { status: 400 });
          }
          amount = usdCents;
        }
        const { error } = await supabaseAdmin.rpc("apply_successful_payment", {
          p_reference: event.data.reference,
          p_paid_at: event.data.paid_at ?? new Date().toISOString(),
          ...(event.data.channel ? { p_channel: event.data.channel } : {}),
          ...(typeof amount === "number" ? { p_amount: amount } : {}),
        });

        if (error) {
          console.error("paystack_webhook_apply_failed", error.message);
          return new Response("Could not record payment", { status: 500 });
        }

        // Yearly plans: the payment records one period; stretch it to a full year (idempotent).
        if (intervalFromReference(event.data.reference) === "yearly") {
          const { data: pay } = await supabaseAdmin
            .from("payments")
            .select("tenant_id")
            .eq("reference", event.data.reference)
            .maybeSingle();
          if (pay) {
            const { data: sub } = await supabaseAdmin
              .from("subscriptions")
              .select("period_start")
              .eq("tenant_id", pay.tenant_id)
              .maybeSingle();
            if (sub) {
              const end = new Date(`${sub.period_start}T00:00:00Z`);
              end.setUTCFullYear(end.getUTCFullYear() + 1);
              await supabaseAdmin
                .from("subscriptions")
                .update({ period_end: end.toISOString().slice(0, 10) })
                .eq("tenant_id", pay.tenant_id);
            }
          }
        }

        {
          const { data: pay } = await supabaseAdmin
            .from("payments")
            .select("tenant_id, tier")
            .eq("reference", event.data.reference)
            .maybeSingle();
          if (pay) {
            await sendReceiptOnce(supabaseAdmin, {
              tenantId: pay.tenant_id,
              reference: event.data.reference,
              to: event.data.customer?.email,
              kind: "subscription",
              tier: pay.tier,
              amountMinor: event.data.amount ?? 0,
              currency: event.data.currency ?? "USD",
              channel: event.data.channel ?? null,
              paidAt: event.data.paid_at ?? new Date().toISOString(),
            });
          }
        }

        return new Response("ok");
      },
    },
  },
});
