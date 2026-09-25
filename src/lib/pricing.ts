/** Single source of truth for paid package prices (USD dollars per month). */
export type PlanTier = "basic" | "standard" | "premium";
/** Defaults; Prime Haven can change these in console Settings (applied via applyPricing). */
export const MONTHLY_USD: Record<PlanTier, number> = { basic: 10, standard: 25, premium: 50 };
export type AnyTier = PlanTier | "free";
export type BillingInterval = "monthly" | "yearly";

/** Customer-facing plan names. Internal ids never change so stored data stays valid. */
export const PLAN_LABELS: Record<AnyTier, string> = {
  free: "Free",
  basic: "Standard",
  standard: "Pro",
  premium: "Premium",
};

export function planLabel(tier: string | null | undefined) {
  return PLAN_LABELS[(tier ?? "") as AnyTier] ?? tier ?? "";
}

/** Yearly discount per plan. */
export const YEARLY_DISCOUNT: Record<PlanTier, number> = { basic: 0.08, standard: 0.1, premium: 0.15 };
export function maxYearlyDiscount() {
  return Math.max(...Object.values(YEARLY_DISCOUNT));
}

/** Apply live prices from platform settings (mutates the shared tables in place). */
export function applyPricing(p: { monthly: Record<PlanTier, number>; yearly_discount: Record<PlanTier, number> } | null | undefined) {
  if (!p) return;
  for (const t of ["basic", "standard", "premium"] as const) {
    if (Number.isFinite(p.monthly[t]) && p.monthly[t] > 0) MONTHLY_USD[t] = p.monthly[t];
    if (Number.isFinite(p.yearly_discount[t])) YEARLY_DISCOUNT[t] = p.yearly_discount[t];
  }
}

/** Yearly total = monthly x 12, less that plan's discount. */
export function yearlyUsd(tier: PlanTier) {
  return Math.round(MONTHLY_USD[tier] * 12 * (1 - YEARLY_DISCOUNT[tier]) * 100) / 100;
}

export function yearlyPerMonthUsd(tier: PlanTier) {
  return Math.round((yearlyUsd(tier) / 12) * 100) / 100;
}

/** Charge amount in USD cents for the chosen interval. */
export function priceUsdCents(tier: PlanTier, interval: BillingInterval) {
  return Math.round((interval === "yearly" ? yearlyUsd(tier) : MONTHLY_USD[tier]) * 100);
}

/** Payment references carry the interval so every record states how it was billed. */
export function referencePrefix(interval: BillingInterval) {
  return interval === "yearly" ? "gchy" : "gch";
}
export function intervalFromReference(reference: string): BillingInterval {
  return reference.startsWith("gchy_") ? "yearly" : "monthly";
}
