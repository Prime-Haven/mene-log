# Database check, flat cedi rate, and location-based currency

## 1. Database from allsql.sql
The live database already has 29 tables, matching every table in allsql.sql. Running the file again would fail or create duplicates, so I will:
- Compare allsql.sql with the live database: tables, columns, security rules, functions, rate limiting.
- Add anything missing with safe, additive changes only. Nothing gets deleted.
- Confirm the app reads and writes correctly afterwards.

## 2. Flat exchange rate: 1 USD = 11 GHS
- One fixed rate of 11, set in one place. Live international rates are never used.
- Example: $15 Basic = GHS 165, $30 Standard = GHS 330, $55 Premium = GHS 605. Extra-space bundles follow the same rule.

## 3. Currency by visitor location
- The server reads the visitor's country from the hosting network's location header, with a lookup based on the visitor's IP address as a fallback.
- Ghana: prices appear in GHS (USD x 11), and Paystack charges in GHS, since Ghanaian Paystack accounts settle in cedis.
- US and everywhere else: prices appear and are charged in USD.
- Where this applies: homepage pricing, onboarding plan step, Billing (renewals and extra space), and the payment history amounts.
- The server always recalculates the amount. A visitor can't change the price or currency from their browser.

## Technical details
- `src/lib/currency.ts`: `USD_TO_GHS = 11`, `formatPrice(usdCents, currency)`.
- `src/lib/geo.functions.ts`: `getVisitorCurrency` server function. It reads the `cf-ipcountry` header, falls back to an IP lookup, and returns `"GHS" | "USD"`. Results are cached with React Query.
- `billing.functions.ts`: the server works out the currency and sends `amount x 11` (pesewas) with `currency: "GHS"` for Ghana. Payment rows store the actual currency and amount.
- Paystack webhook and `apply_successful_payment` / `apply_space_purchase`: add amount checks that accept either the USD or the GHS amount. This needs a small database change.
