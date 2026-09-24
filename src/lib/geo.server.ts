import { getRequestHeader } from "@tanstack/react-start/server";
import { currencyCodeForCountry, USD, type Currency } from "./currency";
import { usdRateFor } from "./rates.server";

async function detectCountry(): Promise<string | null> {
  const header = getRequestHeader("cf-ipcountry");
  if (header && header !== "XX" && header !== "T1") return header.toUpperCase();

  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || getRequestHeader("cf-connecting-ip") || getRequestHeader("x-real-ip");
  if (!ip) return null;
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const c = (await res.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

/** Visitor's currency from their IP location, with today's live rate. Server-only. */
export async function detectCurrency(): Promise<Currency> {
  const country = await detectCountry();
  const code = currencyCodeForCountry(country);
  const rate = await usdRateFor(code);
  if (!rate) return { ...USD, country };
  return { code, rate, country };
}
