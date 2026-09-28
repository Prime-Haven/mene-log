import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { clientIp, orNull } from "@/lib/checkin.functions";

/**
 * Leader sign-up for Standard and Premium churches. Everything is verified on the
 * server: the church's leader access code, the package, the field limits and the
 * rate limit. The browser never touches church tables directly.
 */

const subdomain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{3,40}$/);

const registerSchema = z.object({
  subdomain,
  access_code: z.string().trim().min(4).max(24),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  password: z
    .string()
    .min(8)
    .max(16)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
  phone: z.string().trim().min(9).max(20),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  leader_type_id: z.string().uuid().optional().or(z.literal("")),
  photo: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/)
    .max(2_200_000)
    .optional()
    .or(z.literal("")),
});

export const getPublicLeaderTypes = createServerFn({ method: "GET" })
  .inputValidator((data: { subdomain: string }) => z.object({ subdomain }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("public_leader_types", {
      p_subdomain: data.subdomain,
    });
    return error ? [] : (rows ?? []);
  });

export const getPublicLeaders = createServerFn({ method: "GET" })
  .inputValidator((data: { subdomain: string }) => z.object({ subdomain }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("public_leader_options", {
      p_subdomain: data.subdomain,
    });
    return error ? [] : (rows ?? []);
  });

export const registerLeader = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key)
      return { ok: false as const, message: "Leader sign-up is unavailable right now." };

    const { data: church } = await supabaseAdmin.rpc("tenant_branding", {
      p_subdomain: data.subdomain,
    });
    const tenant = church as { id: string; name: string } | null;
    if (!tenant) return { ok: false as const, message: "This church could not be found." };

    const origin = getRequestHeader("origin") ?? "";

    const publicClient = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signUp, error: signUpError } = await publicClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
        ...(origin.startsWith("http") ? { emailRedirectTo: `${origin}/auth` } : {}),
      },
    });
    if (signUpError || !signUp.user) {
      return {
        ok: false as const,
        message: signUpError?.message ?? "Could not create this leader account.",
      };
    }

    let photoPath: string | null = null;
    if (data.photo) {
      const base64 = data.photo.split(",")[1] ?? "";
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const extension = data.photo.includes("image/png") ? "png" : "jpg";
      const path = `${tenant.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("tenant-branding")
        .upload(path, bytes, { contentType: `image/${extension === "jpg" ? "jpeg" : "png"}` });
      if (!uploadError) photoPath = path;
    }

    const { error } = await supabaseAdmin.rpc("register_leader", {
      p_subdomain: data.subdomain,
      p_user: signUp.user.id,
      p_code: data.access_code,
      p_full_name: data.full_name,
      p_email: data.email,
      p_phone: data.phone,
      p_dob: orNull(data.date_of_birth ? data.date_of_birth : null),
      p_location: data.location ?? "",
      p_leader_type: orNull(data.leader_type_id ? data.leader_type_id : null),
      p_photo_path: orNull(photoPath),
      p_ip: clientIp(),
    });

    if (error) {
      return { ok: false as const, message: error.message.replace(/^.*?:\s*/, "") };
    }

    return {
      ok: true as const,
      church: tenant.name,
      needsEmailConfirmation: !signUp.session,
    };
  });
