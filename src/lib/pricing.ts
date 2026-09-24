/** Single source of truth for package prices (USD dollars per month). */
export const MONTHLY_USD = { basic: 15, standard: 30, premium: 55 } as const;
export type PlanTier = keyof typeof MONTHLY_USD;
export type BillingInterval = "monthly" | "yearly";

export const YEARLY_DISCOUNT = 0.2;

/** Yearly total = monthly x 12, less 20%. */
export function yearlyUsd(tier: PlanTier) {
  return Math.round(MONTHLY_USD[tier] * 12 * (1 - YEARLY_DISCOUNT) * 100) / 100;
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
