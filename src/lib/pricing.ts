/** Single source of truth for paid package prices (USD dollars per month). */
export const MONTHLY_USD = { basic: 10, standard: 25, premium: 50 } as const;
export type PlanTier = keyof typeof MONTHLY_USD;
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
export const MAX_YEARLY_DISCOUNT = Math.max(...Object.values(YEARLY_DISCOUNT));

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
