/**
 * Visitor currency: ISO code plus the live USD→code rate.
 * Prices are always stored in USD; display converts with `rate`.
 */
export type Currency = { code: string; rate: number; country: string | null };

export const USD: Currency = { code: "USD", rate: 1, country: null };

export function isGhana(c: Currency) {
  return c.code === "GHS";
}

/** Format a USD dollar amount in the visitor's currency at the live rate. */
export function formatUsd(usdDollars: number, currency: Currency) {
  const value = usdDollars * currency.rate;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.code,
      maximumFractionDigits: Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2,
      minimumFractionDigits: Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2,
    }).format(value);
  } catch {
    return `$${usdDollars.toLocaleString()}`;
  }
}

/** Countries whose card payments are charged in USD but shown locally. */
export function isApproximate(c: Currency) {
  return c.code !== "USD" && c.code !== "GHS";
}

const COUNTRY_CURRENCY: Record<string, string> = {
  GH: "GHS", US: "USD", GB: "GBP", NG: "NGN", KE: "KES", ZA: "ZAR", CA: "CAD", AU: "AUD",
  NZ: "NZD", IN: "INR", JP: "JPY", CN: "CNY", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK",
  BR: "BRL", MX: "MXN", EG: "EGP", CI: "XOF", SN: "XOF", TG: "XOF", BJ: "XOF", BF: "XOF",
  ML: "XOF", NE: "XOF", CM: "XAF", UG: "UGX", TZ: "TZS", RW: "RWF", ZM: "ZMW", SL: "SLE",
  LR: "LRD", AE: "AED", SA: "SAR", PH: "PHP", SG: "SGD", KR: "KRW", PL: "PLN", TR: "TRY",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR",
  AT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR",
  LT: "EUR", CY: "EUR", MT: "EUR", HR: "EUR",
};

export function currencyCodeForCountry(country: string | null | undefined): string {
  return COUNTRY_CURRENCY[(country ?? "").toUpperCase()] ?? "USD";
}
