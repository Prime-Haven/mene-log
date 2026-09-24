import { getRequestHeader } from "@tanstack/react-start/server";
import { currencyForCountry, type Currency } from "./currency";

/** Works out the visitor's currency from their IP location. Server-only. */
export async function detectCurrency(): Promise<Currency> {
  const header = getRequestHeader("cf-ipcountry");
  if (header && header !== "XX" && header !== "T1") return currencyForCountry(header);

  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || getRequestHeader("cf-connecting-ip") || getRequestHeader("x-real-ip");
  if (!ip) return "USD";
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return "USD";
    return currencyForCountry((await res.text()).trim());
  } catch {
    return "USD";
  }
}
