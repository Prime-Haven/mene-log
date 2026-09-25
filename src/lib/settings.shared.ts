import { z } from "zod";

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,24}$/, "Codes use 3–24 letters, numbers or dashes"),
  percent: z.number().int().min(1).max(100),
  tiers: z.array(z.enum(["basic", "standard", "premium"])).min(1),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  max_uses: z.number().int().min(1).max(100000).nullable(),
  uses: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export type Coupon = z.infer<typeof couponSchema>;

export const settingsSchema = z.object({
  branding: z.object({
    platform_name: z.string().trim().min(2).max(40),
    tagline: z.string().trim().max(160),
    support_email: z.string().trim().email().or(z.literal("")),
    support_phone: z.string().trim().max(30),
    primary_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  pricing: z.object({
    monthly: z.object({ basic: z.number().min(1).max(10000), standard: z.number().min(1).max(10000), premium: z.number().min(1).max(10000) }),
    yearly_discount: z.object({ basic: z.number().min(0).max(0.9), standard: z.number().min(0).max(0.9), premium: z.number().min(0).max(0.9) }),
  }),
  signups: z.object({
    blocked_domains: z.array(z.string().trim().toLowerCase().max(80)).max(200),
    maintenance: z.boolean(),
    maintenance_message: z.string().max(300),
  }),
  email: z.object({
    sender_name: z.string().trim().min(2).max(60),
    reply_to: z.string().trim().email().or(z.literal("")),
    footer_text: z.string().max(300),
  }),
  messaging: z.object({
    quiet_start: z.number().int().min(0).max(23),
    quiet_end: z.number().int().min(0).max(23),
    default_absence_threshold: z.number().int().min(1).max(12),
  }),
  legal: z.object({ terms_extra: z.string().max(20000), privacy_extra: z.string().max(20000) }),
  homepage: z.object({
    show_stats: z.boolean(),
    banner: z.string().max(200),
  }),
  coupons: z.array(couponSchema).max(200),
});
export type PlatformSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  branding: { platform_name: "Mene:Log", tagline: "Every person counted, every person cared for.", support_email: "support@menelog.site", support_phone: "", primary_color: "#3b82f6" },
  pricing: { monthly: { basic: 10, standard: 25, premium: 50 }, yearly_discount: { basic: 0.08, standard: 0.1, premium: 0.15 } },
  signups: { blocked_domains: [], maintenance: false, maintenance_message: "" },
  email: { sender_name: "Mene:Log", reply_to: "support@menelog.site", footer_text: "" },
  messaging: { quiet_start: 21, quiet_end: 7, default_absence_threshold: 3 },
  legal: { terms_extra: "", privacy_extra: "" },
  homepage: { show_stats: true, banner: "" },
  coupons: [],
};

/** Safe-for-public subset (never coupons or blocked domains). */
export type PublicSettings = Pick<PlatformSettings, "branding" | "pricing" | "homepage" | "legal"> & {
  maintenance: boolean;
  maintenance_message: string;
};
