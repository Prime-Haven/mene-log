# Pricing update: new prices, live exchange rates, centered toggle

## 1. New package prices
- Basic $10, Standard $25, Premium $50 per month (single source of truth, so every screen and checkout follows).
- Yearly stays derived: monthly x 12 less 20% -> Basic $96, Standard $240, Premium $480 per year ($8 / $20 / $40 per month).

## 2. Live international exchange rates (location detection kept)
- Drop the fixed 10 GHS rate.
- Visitor location still detected from their IP, as today.
- Fetch today's real rates from a free public rates service, cached on the server for about an hour so pages stay fast; fall back to US dollars if the service is unreachable.
- Ghana: prices shown and charged in cedis at the live rate; card + mobile money.
- Other countries: prices shown in the visitor's own currency at the live rate (e.g. euros, naira, pounds), marked "approx." where the card will be charged in US dollars; card only.
- Fix the dollar/cedi mix-up: every price uses one formatter so the symbol always matches the number (no "$" next to a cedi amount or vice versa) on the homepage, sign-up plan step, Billing, extra space and payment history.

## 3. Toggle layout
- Toggle sits at the horizontal center of the pricing area, directly above the Standard (middle) card, on the homepage, sign-up and Billing.
- "Save 20% when you pay yearly" appears beneath the toggle (not beside it), fading/sliding down smoothly; space is reserved so cards don't jump.

## Technical details
- `pricing.ts`: MONTHLY_USD = {10, 25, 50}.
- `currency.ts`: remove USD_TO_GHS; `Currency` becomes any ISO code; formatter uses `Intl.NumberFormat` with a passed-in rate.
- `geo.server.ts`: return country + currency code (country->currency map); new `rates.server.ts` fetches `open.er-api.com/v6/latest/USD` with 1h in-memory cache. `getVisitorCurrency` returns `{ country, currency, rate }`; `useCurrency` exposes them.
- `billing.functions.ts`: server recomputes the rate itself (never trusts the browser). Ghana -> charge GHS minor units = round(usdCents x rate); others -> charge USD. Store `usd_cents` and `rate` in Paystack transaction metadata.
- Paystack webhook: after signature check, read the USD amount from the server-set metadata and confirm the paid GHS amount matches usd_cents x rate (within 1 pesewa rounding), replacing the old divide-by-10 check. Database still receives canonical USD, so the existing payment rules keep passing.
- `BillingToggle.tsx`: vertical stack (`flex-col items-center`), badge below with height-animated AnimatePresence; parent containers use `mx-auto w-full` centering.
