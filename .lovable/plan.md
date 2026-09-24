# Pricing: 4 plans, per-plan yearly discounts, payment receipts

## 1. New plan line-up (names shown everywhere)

| New name | Was | Monthly | Yearly discount | Yearly total |
|---|---|---|---|---|
| Free plan | (new) | Free forever | none | none |
| Standard plan | Basic | $10 | 8% | $110.40 |
| Pro plan | Standard | $25 | 10% | $270 |
| Premium plan | Premium | $50 | 15% | $510 |

- Yearly totals are still worked out from the monthly price (monthly x 12, less that plan's discount), so they update if prices change.
- The badge under the toggle now reads "Save up to 15% when you pay yearly". Each paid card shows its own "Save 8%", "Save 10%" or "Save 15%".
- The Free card shows "Free forever" and has no yearly price.
- Existing churches keep their current features. Only the names change: Basic churches now show as "Standard plan", and so on.

## 2. Free plan features
- Included: branded church check-in, membership registry, Excel export.
- Everything else is crossed out on the card and locked in the app. That covers QR attendance, reports, email, Ask Mene, leaders, groups, SMS, automations, follow-ups and branding extras.
- Any church can pick Free when signing up. There's no trial and no payment, and they can upgrade from Billing at any time.
- Free limits start at 1 staff seat, 100 members and 0 messages. You can change these later.

## 3. Payment receipt email
- When a payment clears (package renewal, upgrade or extra member space), the person who paid gets a Mene:Log-branded receipt through your connected Resend account.
- It shows the Mene:Log logo, the church name and a receipt number (the payment reference), plus the plan and whether it's monthly or yearly.
- It also shows the amount and currency actually charged, the payment method (card or mobile money), the date paid and the new renewal date.
- It's sent once per payment, even if Paystack confirms the same payment twice.
- Past payments in Billing get a "Resend receipt" button.

## Technical details
- Internal plan ids stay as `basic`, `standard` and `premium`, so no existing data changes. A new `free` id is added, and every display name comes from one `PLAN_LABELS` map.
- Database: add `'free'` to the `tenant_tier` enum and a `free` branch to `tier_entitlements()` that matches `ENTITLEMENTS.free`. Onboarding lets `free` skip the trial, and the payment functions refuse to charge for `free`. I'll try the migration tool first. If it hits the earlier replay problem, I'll give you a short SQL update to run in the SQL editor and hold the Free option back until it's applied.
- `pricing.ts`: `YEARLY_DISCOUNT` becomes a per-plan map `{ basic: 0.08, standard: 0.10, premium: 0.15 }` and `MAX_YEARLY_DISCOUNT = 0.15`. The webhook's amount check keeps using `priceUsdCents`, so it stays in sync.
- Receipts: a new `receipt.server.ts` renders branded HTML (logo from the published site's absolute URL, inline styles, white background) and sends it through the existing Resend connector. The Paystack webhook calls it after `apply_successful_payment` or `apply_space_purchase` succeeds. An audit entry `receipt.sent` for each reference stops duplicate sends. "Resend receipt" is an admin-only server function.
- Everywhere the plans appear (homepage, onboarding, Billing, operator console, account screens, terms, help assistant, FeatureGate) now reads the new labels.
