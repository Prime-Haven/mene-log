/** Live USD exchange rates, cached in memory for an hour. Server-only. */
let cache: { at: number; rates: Record<string, number> } | null = null;
const TTL = 60 * 60 * 1000;

export async function usdRates(): Promise<Record<string, number> | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.rates;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return cache?.rates ?? null;
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== "success" || !body.rates) return cache?.rates ?? null;
    cache = { at: Date.now(), rates: body.rates };
    return body.rates;
  } catch {
    return cache?.rates ?? null;
  }
}

export async function usdRateFor(code: string): Promise<number | null> {
  if (code === "USD") return 1;
  const rates = await usdRates();
  const r = rates?.[code];
  return typeof r === "number" && r > 0 ? r : null;
}
