import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { USD_TO_GHS } from "@/lib/currency";

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
            metadata?: { tenant_id?: string; tier?: string; kind?: string; slots?: number; charge_currency?: string };
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
          return new Response("ok");
        }

        // Ghana renewals are charged in GHS at the flat rate; the stored price is in USD.
        let amount = event.data.amount;
        if (typeof amount === "number" && event.data.currency === "GHS") {
          if (amount % USD_TO_GHS !== 0) return new Response("Amount mismatch", { status: 400 });
          amount = amount / USD_TO_GHS;
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

        return new Response("ok");
      },
    },
  },
});
