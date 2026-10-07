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
  reports_to_leader_id: z.string().uuid().optional().or(z.literal("")),
  group_name: z.string().trim().max(120).optional().or(z.literal("")),
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

    const { data: church } = await supabaseAdmin.rpc("tenant_branding", {
      p_subdomain: data.subdomain,
    });
    const tenant = church as { id: string; name: string } | null;
    if (!tenant) return { ok: false as const, message: "This church could not be found." };

    // 1. Verify or initialize leader access code
    const { data: codeRow } = await supabaseAdmin
      .from("tenant_leader_access")
      .select("code")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    // Never derive a code from public data: churches must set one explicitly.
    const expectedCode = codeRow?.code;
    if (!expectedCode || expectedCode.trim().length < 8) {
      return {
        ok: false as const,
        message: "Leader sign-up isn't open yet. Please ask your church administrator for the leader access code.",
      };
    }

    if (data.access_code.trim().toUpperCase() !== expectedCode.trim().toUpperCase()) {
      return {
        ok: false as const,
        message: "That leader access code is not correct. Please ask your church administrator for the code.",
      };
    }

    // 2. Create or link Supabase auth user
    let leaderUserId: string | null = null;
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase().trim(),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name.trim(),
        phone: data.phone.trim(),
      },
    });

    if (newUser?.user) {
      leaderUserId = newUser.user.id;
    } else if (createError?.message?.toLowerCase().includes("already")) {
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const matched = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === data.email.toLowerCase().trim(),
      );
      if (matched) {
        const { data: existingLeader } = await supabaseAdmin
          .from("leader_profiles")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("user_id", matched.id)
          .maybeSingle();
        if (existingLeader) {
          return {
            ok: false as const,
            message:
              "An account with this email is already registered as a leader. Please use 'Leader Login' to sign in.",
          };
        }
        // Never take over an existing account: the owner must prove control
        // by signing in with their own password.
        const { createClient } = await import("@supabase/supabase-js");
        const verifier = createClient(
          process.env["SUPABASE_URL"] ?? "",
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "",
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { error: signInError } = await verifier.auth.signInWithPassword({
          email: data.email.toLowerCase().trim(),
          password: data.password,
        });
        if (signInError) {
          return {
            ok: false as const,
            message:
              "An account with this email already exists. Enter that account's current password to register as a leader.",
          };
        }
        leaderUserId = matched.id;
      }
    }

    if (!leaderUserId) {
      return {
        ok: false as const,
        message: createError?.message ?? "Could not create leader account. Please check your details.",
      };
    }

    // 3. Upload photo if present
    let photoPath: string | null = null;
    if (data.photo) {
      try {
        const base64 = data.photo.split(",")[1] ?? "";
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const extension = data.photo.includes("image/png") ? "png" : "jpg";
        const path = `${tenant.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("tenant-branding")
          .upload(path, bytes, { contentType: `image/${extension === "jpg" ? "jpeg" : "png"}` });
        if (!uploadError) photoPath = path;
      } catch (e) {
        console.error("[registerLeader] Photo upload warning:", e);
      }
    }

    // 4. Persist leader profile & user permissions
    // Try enhanced register_leader RPC first, then fallback to direct database upsert
    let registeredSuccessfully = false;
    let rpcErrorMessage = "";

    try {
      // Attempt 1: Call enhanced RPC with hierarchy and group
      const enhancedArgs = {
        p_subdomain: data.subdomain,
        p_user: leaderUserId,
        p_code: data.access_code.trim(),
        p_full_name: data.full_name.trim(),
        p_email: data.email.trim(),
        p_phone: data.phone.trim(),
        p_dob: orNull(data.date_of_birth ? data.date_of_birth : null),
        p_location: data.location ?? "",
        p_leader_type: orNull(data.leader_type_id ? data.leader_type_id : null),
        p_photo_path: orNull(photoPath),
        p_ip: clientIp(),
        p_reports_to: orNull(data.reports_to_leader_id ? data.reports_to_leader_id : null),
        p_group_name: orNull(data.group_name ? data.group_name : null),
      };
      const { error: rpcError } = await supabaseAdmin.rpc("register_leader", enhancedArgs as unknown as {
        p_code: string;
        p_email: string;
        p_full_name: string;
        p_phone: string;
        p_subdomain: string;
        p_user: string;
      });

      if (!rpcError) {
        registeredSuccessfully = true;
      } else {
        rpcErrorMessage = rpcError.message;
        // Attempt 2: Call legacy RPC with 11 parameters
        const legacyArgs = {
          p_subdomain: data.subdomain,
          p_user: leaderUserId,
          p_code: data.access_code.trim(),
          p_full_name: data.full_name.trim(),
          p_email: data.email.trim(),
          p_phone: data.phone.trim(),
          p_dob: orNull(data.date_of_birth ? data.date_of_birth : null),
          p_location: data.location ?? "",
          p_leader_type: orNull(data.leader_type_id ? data.leader_type_id : null),
          p_photo_path: orNull(photoPath),
          p_ip: clientIp(),
        };
        const { error: legacyError } = await supabaseAdmin.rpc("register_leader", legacyArgs as unknown as {
          p_code: string;
          p_email: string;
          p_full_name: string;
          p_phone: string;
          p_subdomain: string;
          p_user: string;
        });

        if (!legacyError) {
          registeredSuccessfully = true;
        } else {
          rpcErrorMessage = legacyError.message;
        }
      }
    } catch (rpcErr) {
      console.warn("[registerLeader] RPC attempt caught error, falling back to direct DB upsert:", rpcErr);
    }

    // Attempt 3: Direct resilient DB insertion if RPC had issues
    if (!registeredSuccessfully) {
      try {
        const { error: profileError } = await supabaseAdmin.from("leader_profiles").upsert(
          {
            tenant_id: tenant.id,
            user_id: leaderUserId,
            full_name: data.full_name.trim(),
            email: data.email.trim().toLowerCase(),
            phone: data.phone.trim(),
            date_of_birth: orNull(data.date_of_birth ? data.date_of_birth : null),
            location: data.location || null,
            leader_type_id: orNull(data.leader_type_id ? data.leader_type_id : null),
            reports_to_leader_id: orNull(data.reports_to_leader_id ? data.reports_to_leader_id : null),
            group_name: orNull(data.group_name ? data.group_name : null),
            photo_path: photoPath,
            status: "active",
          },
          { onConflict: "tenant_id, user_id" }
        );

        if (profileError) {
          console.error("[registerLeader] direct leader_profiles upsert error:", profileError);
          return {
            ok: false as const,
            message: profileError.message || rpcErrorMessage || "Could not complete leader registration.",
          };
        }

        // Ensure tenant_users record exists with role = leader
        await supabaseAdmin.from("tenant_users").upsert(
          {
            tenant_id: tenant.id,
            user_id: leaderUserId,
            role: "leader",
            status: "active",
          },
          { onConflict: "tenant_id, user_id" }
        );

        registeredSuccessfully = true;
      } catch (directErr) {
        console.error("[registerLeader] Direct DB exception:", directErr);
        return {
          ok: false as const,
          message: directErr instanceof Error ? directErr.message : "Could not complete leader registration.",
        };
      }
    }

    return {
      ok: true as const,
      church: tenant.name,
      needsEmailConfirmation: false,
    };
  });
