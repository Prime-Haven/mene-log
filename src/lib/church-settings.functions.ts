import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const churchSettingsSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  denomination: z.string().trim().max(100).optional(),
  contact_phone: z.string().trim().max(40).optional(),
  contact_email: z.string().trim().email().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(250).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  timezone: z.string().trim().max(60).default("UTC"),
  currency: z.string().trim().max(10).default("GHS"),
  member_code_prefix: z.string().trim().max(8).default("ML-"),

  // Branding
  brand_primary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#3b82f6"),
  brand_accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#0f172a"),
  welcome_message: z.string().trim().max(300).optional().or(z.literal("")),
  submit_button_text: z.string().trim().max(40).default("Check in"),
  group_vocabulary: z.string().trim().max(40).default("Group"),

  // Check-in policies
  checkin_window_hours: z.number().int().min(1).max(24).default(4),
  allow_self_registration: z.boolean().default(true),
  require_phone_on_checkin: z.boolean().default(false),
  require_residence_on_checkin: z.boolean().default(false),

  // Member care & messaging
  reply_to_email: z.string().trim().email().max(120).optional().or(z.literal("")),
  sms_sender_id: z.string().trim().max(11).optional().or(z.literal("")),
  quiet_hour_start: z.number().int().min(0).max(23).default(21),
  quiet_hour_end: z.number().int().min(0).max(23).default(7),
  absence_threshold: z.number().int().min(1).max(12).default(3),
  auto_welcome_enabled: z.boolean().default(false),
  auto_welcome_message: z.string().trim().max(300).optional().or(z.literal("")),
  auto_absent_enabled: z.boolean().default(false),
  auto_absent_message: z.string().trim().max(300).optional().or(z.literal("")),

  // Security controls
  require_mfa: z.boolean().default(false),
  session_timeout_minutes: z.number().int().min(15).max(1440).default(60),
});

export type ChurchSettingsData = z.infer<typeof churchSettingsSchema>;

/**
 * Saves comprehensive church settings across branding, check-in rules,
 * care thresholds, and security policies.
 */
export const saveChurchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => churchSettingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
      _tenant: data.tenant_id,
    });
    if (!isAdmin) {
      return { ok: false as const, message: "Only church administrators can save settings." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const settingsObject = {
      denomination: data.denomination ?? "",
      address: data.address ?? "",
      city: data.city ?? "",
      country: data.country ?? "",
      timezone: data.timezone,
      currency: data.currency,
      member_code_prefix: data.member_code_prefix,
      checkin_window_hours: data.checkin_window_hours,
      allow_self_registration: data.allow_self_registration,
      require_phone_on_checkin: data.require_phone_on_checkin,
      require_residence_on_checkin: data.require_residence_on_checkin,
      auto_welcome_enabled: data.auto_welcome_enabled,
      auto_welcome_message: data.auto_welcome_message ?? "",
      auto_absent_enabled: data.auto_absent_enabled,
      auto_absent_message: data.auto_absent_message ?? "",
      session_timeout_minutes: data.session_timeout_minutes,
    };

    const updatePayload: Record<string, unknown> = {
      name: data.name,
      brand_primary: data.brand_primary,
      brand_accent: data.brand_accent,
      welcome_message: data.welcome_message || null,
      submit_button_text: data.submit_button_text,
      group_vocabulary: data.group_vocabulary,
      contact_phone: data.contact_phone || null,
      contact_email: data.contact_email || null,
      reply_to_email: data.reply_to_email || null,
      sms_sender_id: data.sms_sender_id || null,
      quiet_hour_start: data.quiet_hour_start,
      quiet_hour_end: data.quiet_hour_end,
      absence_threshold: data.absence_threshold,
      require_mfa: data.require_mfa,
      settings: settingsObject,
    };

    const { error } = await supabaseAdmin
      .from("tenants")
      .update(updatePayload as never)
      .eq("id", data.tenant_id);

    if (error) throw error;

    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "church.settings_updated",
      _target: data.tenant_id,
      _detail: { updated_by: userId, name: data.name },
      _actor: userId,
    });

    return { ok: true as const, message: "Settings saved successfully" };
  });

/**
 * Resets weekly default services (Sunday, Midweek, Prayer Service).
 */
export const resetWeeklyServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
      _tenant: data.tenant_id,
    });
    if (!isAdmin) throw new Error("Administrator access required.");

    const { error } = await supabase.rpc("ensure_default_services", {
      p_tenant: data.tenant_id,
    });
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "services.defaults_reset",
      _target: data.tenant_id,
      _detail: {},
      _actor: userId,
    });

    return { ok: true as const, message: "Default services verified & active" };
  });

/**
 * Clears test attendance records.
 * ONLY callable by church owner.
 * Member profiles, groups, services, and accounts are 100% PRESERVED.
 */
export const clearTestAttendanceRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (membership?.role !== "owner") {
      throw new Error("Only the church owner can reset attendance data.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count, error } = await supabaseAdmin
      .from("attendance")
      .delete({ count: "exact" })
      .eq("tenant_id", data.tenant_id);

    if (error) throw error;

    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "attendance.cleared_test_data",
      _target: data.tenant_id,
      _detail: { deleted_count: count ?? 0 },
      _actor: userId,
    });

    return { ok: true as const, deleted_count: count ?? 0 };
  });
