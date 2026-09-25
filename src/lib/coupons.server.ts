import type { Coupon } from "./settings.shared";

export function findUsableCoupon(coupons: Coupon[], code: string, tier: "basic" | "standard" | "premium") {
  const c = coupons.find((x) => x.code === code.trim().toUpperCase());
  if (!c || !c.active || !c.tiers.includes(tier)) return null;
  if (c.expires_on && c.expires_on < new Date().toISOString().slice(0, 10)) return null;
  if (c.max_uses !== null && c.uses >= c.max_uses) return null;
  return c;
}
