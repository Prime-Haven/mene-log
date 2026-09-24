import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Public check-in runs entirely on the server with the service-role client so the
 * browser never reads or writes church data directly. Rate limiting, validation and
 * QR issuing all happen inside the database's security-definer functions.
 */

const checkinSchema = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,40}$/, "Invalid church address"),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["male", "female"]),
  marital_status: z.enum([
    "single",
    "married",
    "divorced",
    "widowed",
    "separated",
    "prefer_not_to_say",
  ]),
  residential_area: z.string().trim().min(2).max(120),
  occupation: z.string().trim().min(2).max(120),
  education_level: z.string().trim().max(60).optional().or(z.literal("")),
  invited_by_leader_id: z.string().uuid().optional().or(z.literal("")),
  service_id: z.string().uuid(),
  consent: z.literal(true),
});

/** Generated RPC types mark optional arguments as non-null; this keeps them honest. */
export const orNull = <T>(value: T | null): T => value as unknown as T;

export const clientIp = createServerOnlyFn((): string => {
  const forwarded = getRequestHeader("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-real-ip") ?? "unknown";
});

export const getChurchBranding = createServerFn({ method: "GET" })
  .inputValidator((data: { subdomain: string }) =>
    z.object({ subdomain: z.string().trim().toLowerCase().max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: branding, error } = await supabaseAdmin.rpc("tenant_branding", {
      p_subdomain: data.subdomain,
    });
    if (error) return null;
    return branding as {
      id: string;
      name: string;
      subdomain: string;
      tier: "free" | "basic" | "standard" | "premium";
      logo_path: string | null;
      background_path: string | null;
      brand_primary: string;
      brand_accent: string;
      welcome_message: string | null;
      submit_button_text: string;
      active: boolean;
    } | null;
  });

export const getPublicOpenServices = createServerFn({ method: "GET" })
  .inputValidator((data: { subdomain: string }) =>
    z.object({ subdomain: z.string().trim().toLowerCase().max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: services, error } = await supabaseAdmin.rpc("public_open_services", {
      p_subdomain: data.subdomain,
    });
    if (error) return [];
    return services ?? [];
  });

export const getBrandAssetUrl = createServerFn({ method: "GET" })
  .inputValidator((data: { path: string }) =>
    z
      .object({ path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]+\.(png|jpe?g|webp)$/i) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("tenant-branding")
      .createSignedUrl(data.path, 3600);
    return error ? null : signed.signedUrl;
  });

export const submitSelfCheckin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => checkinSchema.parse(data))
  .handler(async ({ data }) => {
    // Cheap per-request guard before touching the database at all.
    getRequest();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc("self_checkin_v3", {
      p_subdomain: data.subdomain,
      p_service: data.service_id,
      p_full_name: data.full_name,
      p_phone: data.phone,
      p_email: data.email ?? "",
      p_dob: data.date_of_birth,
      p_gender: data.gender,
      p_marital_status: data.marital_status,
      p_area: data.residential_area,
      p_occupation: data.occupation,
      p_education: data.education_level ?? "",
      p_leader: orNull(data.invited_by_leader_id ? data.invited_by_leader_id : null),
      p_ip: clientIp(),
    });

    if (error) {
      // Surface only the human-readable message, never provider internals.
      return { ok: false as const, message: error.message.replace(/^.*?:\s*/, "") };
    }

    const payload = result as unknown as {
      token: string;
      returning: boolean;
      checked_in: boolean;
      church: string;
      service: string;
    };
    return {
      ok: true as const,
      token: payload.token,
      returning: payload.returning,
      checked_in: payload.checked_in,
      church: payload.church,
      service: payload.service,
    };
  });
