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
  // Trust only the edge-provided address; client-sent forwarding headers can be forged.
  return getRequestHeader("cf-connecting-ip") ?? "unknown";
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
      tier: "free" | "standard" | "pro" | "premium";
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

    // 1. Fetch tenant to verify
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, name, status")
      .eq("subdomain", data.subdomain)
      .in("status", ["active", "grace"])
      .maybeSingle();

    if (!tenant) return [];

    // 2. Ensure canonical default services exist (Sunday Service, Midweek Service, Prayer Service)
    const defaults = [
      { name: "Sunday Service", type: "sunday" },
      { name: "Midweek Service", type: "midweek" },
      { name: "Prayer Service", type: "prayer" },
    ];

    for (const def of defaults) {
      const { data: existing } = await supabaseAdmin
        .from("services")
        .select("id, is_open")
        .eq("tenant_id", tenant.id)
        .eq("service_type", def.type)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("services").insert({
          tenant_id: tenant.id,
          name: def.name,
          service_type: def.type,
          is_default: true,
          is_open: true,
        });
      } else if (!existing.is_open) {
        await supabaseAdmin.from("services").update({ is_open: true }).eq("id", existing.id);
      }
    }

    // 3. Fetch all open services for this church
    const { data: allServices } = await supabaseAdmin
      .from("services")
      .select(
        "id, name, service_date, is_open, service_type, theme, description, speaker, is_default",
      )
      .eq("tenant_id", tenant.id)
      .eq("is_open", true)
      .order("created_at", { ascending: false });

    const list = allServices ?? [];

    // Sort order:
    // 1. Sunday Service (default)
    // 2. Midweek Service (default)
    // 3. Prayer Service (default)
    // 4. Admin-created special services
    const getPriority = (s: {
      service_type?: string | null;
      name: string;
      is_default?: boolean | null;
    }) => {
      if (s.is_default || s.service_type === "sunday" || s.name === "Sunday Service") return 1;
      if (s.is_default || s.service_type === "midweek" || s.name === "Midweek Service") return 2;
      if (s.is_default || s.service_type === "prayer" || s.name === "Prayer Service") return 3;
      return 4;
    };

    return list.sort((a, b) => {
      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pA - pB;
      return (a.service_date || "") < (b.service_date || "") ? 1 : -1;
    });
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
      if (
        error.message.includes("unique or exclusion constraint") ||
        error.message.includes("ON CONFLICT")
      ) {
        console.error(
          "[Check-in Constraint Error] PostgreSQL raised missing unique constraint on attendance table. " +
            "Please run attendance-conflict-fix.sql (Migration 0024) in the Supabase SQL Editor.",
          error,
        );
        return {
          ok: false as const,
          message:
            "A database index update is required for check-in: please run the attendance-conflict-fix.sql script in your Supabase SQL Editor.",
        };
      }
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
