import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicSettings } from "@/lib/settings.functions";
import { applyPricing } from "@/lib/pricing";

/** Loads Prime Haven's public settings and applies live prices before rendering prices. */
export function usePlatformSettings() {
  const fn = useServerFn(getPublicSettings);
  const q = useQuery({ queryKey: ["public-settings"], staleTime: 60_000, retry: 1, queryFn: () => fn() });
  applyPricing(q.data?.pricing);
  return q.data ?? null;
}
