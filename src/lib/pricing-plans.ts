import {
  MONTHLY_USD,
  YEARLY_DISCOUNT,
  yearlyUsd,
  yearlyPerMonthUsd,
  type AnyTier,
  type PlanTier,
  type BillingInterval,
} from "./pricing";

export interface PricingTierItem {
  id: AnyTier;
  name: string;
  blurb: string;
  features: string[];
  missing: string[];
  featured?: boolean;
}

export const PRICING_TIERS: PricingTierItem[] = [
  {
    id: "free",
    name: "Free",
    blurb: "Free forever for any church getting started.",
    features: ["Branded church check-in", "QR attendance", "Membership registry", "Excel export"],
    missing: [
      "Excel import",
      "Reports",
      "Email",
      "Ask Mene:Log AI",
      "Leadership structure",
      "Multiple branches",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    blurb: "For a single-site church ready to move beyond paper.",
    features: [
      "Branded church check-in",
      "QR attendance",
      "Membership registry",
      "Excel import and export",
      "Core reports and email",
    ],
    missing: ["Leadership structure", "Multiple branches"],
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "For churches led through ministries, units or departments.",
    features: [
      "Everything in Standard",
      "Leadership and groups",
      "Leader access",
      "Email broadcasts",
      "Deeper insights",
    ],
    missing: ["Multiple branches", "Text messaging"],
    featured: true,
  },
  {
    id: "premium",
    name: "Premium",
    blurb: "For multi-branch and cell-structured ministries.",
    features: [
      "Everything in Pro",
      "Multiple branches",
      "Text messaging",
      "Automated follow-up",
      "Advanced reports and audit",
    ],
    missing: [],
  },
];

export { MONTHLY_USD, YEARLY_DISCOUNT, yearlyUsd, yearlyPerMonthUsd };
export type { AnyTier, PlanTier, BillingInterval };
