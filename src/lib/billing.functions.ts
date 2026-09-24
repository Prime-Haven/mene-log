import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { detectCurrency } from "./geo.server";
import { MONTHLY_USD, priceUsdCents, referencePrefix } from "./pricing";

/**
 * Paystack initialisation. The secret key is read inside the handler and is
 * expected to be absent until the church owner supplies it — in that case we
 * return a clear "not configured" state instead of failing.
 */

export const TIER_PRICES_PESEWAS: Record<string, number> = {
  basic: MONTHLY_USD.basic * 100,
  standard: MONTHLY_USD.standard * 100,
  premium: MONTHLY_USD.premium * 100,
};

/** One-off top-ups of member capacity, on top of whatever the package includes. */
export const EXTRA_SPACE_BUNDLES = [
  { slots: 100, amountPesewas: 500 }, // USD 5.00
  { slots: 500, amountPesewas: 2000 }, // USD 20.00
  { slots: 2000, amountPesewas: 6000 }, // USD 60.00
] as const;

const schema = z.object({
  tenant_id: z.string().uuid(),
  tier: z.enum(["basic", "standard", "premium"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

const spaceSchema = z.object({
  tenant_id: z.string().uuid(),
  slots: z.number().int().positive(),
});

export const startPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _tenant: data.tenant_id });
    if (isAdmin !== true) {
      return {
        ok: false as const,
        reason: "forbidden" as const,
        message: "Only an administrator can pay.",
      };
    }

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) {
      return {
        ok: false as const,
        reason: "not_configured" as const,
        message: "Card and mobile money payments are not switched on yet.",
      };
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, contact_email, subdomain")
      .eq("id", data.tenant_id)
      .single();
    if (!tenant) {
      return { ok: false as const, reason: "forbidden" as const, message: "Church not found." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    const email = profile?.email ?? tenant.contact_email;
    if (!email) {
      return {
        ok: false as const,
        reason: "no_email" as const,
        message: "Add a contact email address before paying.",
      };
    }

    // The payment row keeps the canonical USD price; Ghana visitors are charged the flat-rate GHS amount.
    // Rate is recomputed on the server; Ghana pays GHS at today's rate, everyone else pays USD by card.
    const visitor = await detectCurrency();
    const currency = visitor.code === "GHS" ? "GHS" : "USD";
    const rate = currency === "GHS" ? visitor.rate : 1;
    const usdAmount = priceUsdCents(data.tier, data.interval);
    const amount = Math.round(usdAmount * rate);
    const reference = `${referencePrefix(data.interval)}_${data.tenant_id.slice(0, 8)}_${Date.now().toString(36)}`;

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount,
        currency,
        reference,
        channels: currency === "GHS" ? ["card", "mobile_money"] : ["card"],
        metadata: { tenant_id: data.tenant_id, tier: data.tier, kind: "subscription", charge_currency: currency, interval: data.interval, usd_cents: usdAmount, rate },
      }),
    });

    if (!response.ok) {
      console.error("paystack_initialize_failed", response.status);
      return {
        ok: false as const,
        reason: "gateway_error" as const,
        message: "The payment provider could not start this payment. Please try again shortly.",
      };
    }

    const body = (await response.json()) as {
      status: boolean;
      data?: { authorization_url: string; reference: string };
    };
    if (!body.status || !body.data) {
      return {
        ok: false as const,
        reason: "gateway_error" as const,
        message: "The payment provider could not start this payment.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("payments").insert({
      tenant_id: data.tenant_id,
      reference: body.data.reference,
      amount_kobo: usdAmount,
      currency: "USD",
      tier: data.tier,
      status: "pending",
    });
    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "payment.initialised",
      _target: body.data.reference,
      _detail: { tier: data.tier, amount, currency, interval: data.interval },
      _actor: userId,
    });

    return { ok: true as const, authorization_url: body.data.authorization_url };
  });

export const startSpacePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => spaceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _tenant: data.tenant_id });
    if (isAdmin !== true) {
      return {
        ok: false as const,
        reason: "forbidden" as const,
        message: "Only an administrator can buy extra space.",
      };
    }

    const bundle = EXTRA_SPACE_BUNDLES.find((b) => b.slots === data.slots);
    if (!bundle) {
      return {
        ok: false as const,
        reason: "invalid_bundle" as const,
        message: "Choose one of the available space bundles.",
      };
    }

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) {
      return {
        ok: false as const,
        reason: "not_configured" as const,
        message: "Card and mobile money payments are not switched on yet.",
      };
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, contact_email, tier")
      .eq("id", data.tenant_id)
      .single();
    if (!tenant) {
      return { ok: false as const, reason: "forbidden" as const, message: "Church not found." };
    }
    if (tenant.tier !== "standard" && tenant.tier !== "premium") {
      return {
        ok: false as const,
        reason: "forbidden" as const,
        message: "Extra member space is available on the Pro and Premium plans.",
      };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    const email = profile?.email ?? tenant.contact_email;
    if (!email) {
      return {
        ok: false as const,
        reason: "no_email" as const,
        message: "Add a contact email address before paying.",
      };
    }

    const visitor = await detectCurrency();
    const currency = visitor.code === "GHS" ? "GHS" : "USD";
    const spaceAmount = Math.round(bundle.amountPesewas * (currency === "GHS" ? visitor.rate : 1));
    const reference = `space_${data.tenant_id.slice(0, 8)}_${Date.now().toString(36)}`;

    const { error: requestError } = await supabase.rpc("request_extra_space", {
      p_tenant: data.tenant_id,
      p_slots: bundle.slots,
      p_amount: spaceAmount,
      p_reference: reference,
    });
    if (requestError) {
      return {
        ok: false as const,
        reason: "gateway_error" as const,
        message: requestError.message,
      };
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: spaceAmount,
        currency,
        reference,
        channels: currency === "GHS" ? ["card", "mobile_money"] : ["card"],
        metadata: { tenant_id: data.tenant_id, slots: bundle.slots, kind: "space" },
      }),
    });

    if (!response.ok) {
      console.error("paystack_initialize_failed", response.status);
      return {
        ok: false as const,
        reason: "gateway_error" as const,
        message: "The payment provider could not start this payment. Please try again shortly.",
      };
    }

    const body = (await response.json()) as {
      status: boolean;
      data?: { authorization_url: string; reference: string };
    };
    if (!body.status || !body.data) {
      return {
        ok: false as const,
        reason: "gateway_error" as const,
        message: "The payment provider could not start this payment.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "space.purchase_initialised",
      _target: reference,
      _detail: { slots: bundle.slots, amount: spaceAmount, currency },
      _actor: userId,
    });

    return { ok: true as const, authorization_url: body.data.authorization_url };
  });
