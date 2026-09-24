/** Fixed rate set by the business: 1 USD = 11 GHS. Never use live rates. */
export const USD_TO_GHS = 11;

export type Currency = "USD" | "GHS";

/** Convert a USD amount in cents to the smallest unit of the target currency. */
export function toMinorUnits(usdCents: number, currency: Currency) {
  return currency === "GHS" ? usdCents * USD_TO_GHS : usdCents;
}

/** Format a USD dollar amount (e.g. 15) in the visitor's currency. */
export function formatUsd(usdDollars: number, currency: Currency) {
  const value = currency === "GHS" ? usdDollars * USD_TO_GHS : usdDollars;
  return currency === "GHS" ? `GH₵${value.toLocaleString()}` : `$${value.toLocaleString()}`;
}

export function currencySymbol(currency: Currency) {
  return currency === "GHS" ? "GH₵" : "$";
}

export function currencyForCountry(country: string | null | undefined): Currency {
  return (country ?? "").toUpperCase() === "GH" ? "GHS" : "USD";
}
