import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { couponSchema, settingsSchema, type PublicSettings } from "./settings.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(context: { supabase: any }) {
  const { data, error } = await context.supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("Prime Haven operator access is required.");
}

/** Public, safe subset used by the homepage, sign-up and billing. */
export const getPublicSettings = createServerFn({ method: "GET" }).handler(async (): Promise<PublicSettings> => {
  const { readSettings } = await import("./settings.server");
  const s = await readSettings();
  return { branding: s.branding, pricing: s.pricing, homepage: s.homepage, legal: s.legal, maintenance: s.signups.maintenance, maintenance_message: s.signups.maintenance_message };
});

/** Is a new sign-up with this email allowed right now? */
export const checkSignupAllowed = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().toLowerCase().max(160) }).parse(d))
  .handler(async ({ data }) => {
    const { readSettings } = await import("./settings.server");
    const s = await readSettings();
    if (s.signups.maintenance) return { ok: false as const, message: s.signups.maintenance_message || "New sign-ups are paused for maintenance. Please try again later." };
    const domain = data.email.split("@")[1] ?? "";
    if (domain && s.signups.blocked_domains.includes(domain)) return { ok: false as const, message: "Sign-ups from this email provider aren't accepted. Please use another email address." };
    return { ok: true as const };
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context);
    const { readSettings } = await import("./settings.server");
    return readSettings(true);
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context);
    const { writeSettings } = await import("./settings.server");
    const { audit } = await import("./operator.server");
    const codes = new Set<string>();
    for (const c of data.coupons) {
      if (codes.has(c.code)) throw new Error(`Coupon ${c.code} is listed twice.`);
      codes.add(c.code);
    }
    await writeSettings(data);
    await audit(context.userId, "platform.settings_saved", { sections: Object.keys(data) });
    return { ok: true, message: "Settings saved" };
  });

/** Check a coupon for a plan (used by Billing before paying). */
export const checkCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().trim().toUpperCase().max(24), tier: z.enum(["basic", "standard", "premium"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: membership, error } = await context.supabase
      .from("tenant_users")
      .select("id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .in("role", ["owner", "church_admin"])
      .limit(1)
      .maybeSingle();
    if (error || !membership) throw new Error("Church billing access is required.");
    const { readSettings } = await import("./settings.server");
    const { findUsableCoupon } = await import("./coupons.server");
    const s = await readSettings(true);
    const c = findUsableCoupon(s.coupons, data.code, data.tier);
    if (!c) return { ok: false as const, message: "That code isn't valid for this plan." };
    return { ok: true as const, code: c.code, percent: c.percent };
  });

export type CouponInput = z.infer<typeof couponSchema>;
