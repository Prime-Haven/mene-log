// Platform-wide settings managed by Prime Haven, stored as a private JSON file.
import { DEFAULT_SETTINGS, type PlatformSettings } from "./settings.shared";

const BUCKET = "platform-config";
const FILE = "settings.json";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

let cache: { at: number; value: PlatformSettings } | null = null;

function merge(raw: Partial<PlatformSettings> | null): PlatformSettings {
  const d = DEFAULT_SETTINGS;
  if (!raw) return structuredClone(d);
  return {
    ...d,
    ...raw,
    branding: { ...d.branding, ...(raw.branding ?? {}) },
    pricing: {
      ...d.pricing,
      ...(raw.pricing ?? {}),
      monthly: { ...d.pricing.monthly, ...(raw.pricing?.monthly ?? {}) },
      yearly_discount: { ...d.pricing.yearly_discount, ...(raw.pricing?.yearly_discount ?? {}) },
    },
    signups: { ...d.signups, ...(raw.signups ?? {}) },
    email: { ...d.email, ...(raw.email ?? {}) },
    messaging: { ...d.messaging, ...(raw.messaging ?? {}) },
    legal: { ...d.legal, ...(raw.legal ?? {}) },
    homepage: { ...d.homepage, ...(raw.homepage ?? {}) },
    coupons: raw.coupons ?? [],
  };
}

export async function readSettings(fresh = false): Promise<PlatformSettings> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.value;
  try {
    const client = await db();
    const { data, error } = await client.storage.from(BUCKET).download(FILE);
    const value = merge(error || !data ? null : (JSON.parse(await data.text()) as Partial<PlatformSettings>));
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return merge(null);
  }
}

export async function writeSettings(next: PlatformSettings) {
  const client = await db();
  const { data: buckets } = await client.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await client.storage.createBucket(BUCKET, { public: false });
  }
  const { error } = await client.storage
    .from(BUCKET)
    .upload(FILE, new Blob([JSON.stringify(next)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error("Could not save settings. Try again.");
  cache = { at: Date.now(), value: next };
}
