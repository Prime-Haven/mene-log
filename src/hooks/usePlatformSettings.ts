import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicSettings } from "@/lib/settings.functions";
import { applyPricing } from "@/lib/pricing";
import { DEFAULT_SETTINGS, type PublicSettings } from "@/lib/settings.shared";

const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  branding: DEFAULT_SETTINGS.branding,
  pricing: DEFAULT_SETTINGS.pricing,
  homepage: DEFAULT_SETTINGS.homepage,
  legal: DEFAULT_SETTINGS.legal,
  maintenance: DEFAULT_SETTINGS.signups.maintenance,
  maintenance_message: DEFAULT_SETTINGS.signups.maintenance_message,
};

/** Loads Prime Haven's public settings and applies live prices before rendering prices. */
export function usePlatformSettings(): PublicSettings {
  const fn = useServerFn(getPublicSettings);
  const q = useQuery({
    queryKey: ["public-settings"],
    staleTime: 60_000,
    retry: 1,
    queryFn: () => fn(),
  });
  applyPricing(q.data?.pricing);

  const raw = q.data;
  if (!raw) return DEFAULT_PUBLIC_SETTINGS;

  return {
    ...DEFAULT_PUBLIC_SETTINGS,
    ...raw,
    branding: { ...DEFAULT_PUBLIC_SETTINGS.branding, ...(raw.branding ?? {}) },
    pricing: { ...DEFAULT_PUBLIC_SETTINGS.pricing, ...(raw.pricing ?? {}) },
    homepage: { ...DEFAULT_PUBLIC_SETTINGS.homepage, ...(raw.homepage ?? {}) },
    legal: { ...DEFAULT_PUBLIC_SETTINGS.legal, ...(raw.legal ?? {}) },
  };
}
