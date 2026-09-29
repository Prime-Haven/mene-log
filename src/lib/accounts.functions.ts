import { planLabel } from "./pricing";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const permissionsSchema = z
  .object({
    can_manage_members: z.boolean().default(false),
    can_manage_attendance: z.boolean().default(false),
    can_scan_qr: z.boolean().default(false),
    can_manage_services: z.boolean().default(false),
    can_manage_followups: z.boolean().default(false),
    can_view_reports: z.boolean().default(false),
    can_send_messages: z.boolean().default(false),
    can_manage_settings: z.boolean().default(false),
  })
  .partial();

const schema = z.object({
  tenant_id: z.string().uuid(),
  email: z.string().trim().email().max(160),
  role: z.enum(["church_admin", "branch_admin", "leader", "usher"]),
  branch_id: z.string().uuid().nullable().optional(),
  position_id: z.string().uuid().nullable().optional(),
  permissions: permissionsSchema.optional(),
});

/**
 * Invites a staff login with assigned role and granular permissions.
 */
export const inviteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleError } = await supabase.rpc("is_tenant_admin", {
      _tenant: data.tenant_id,
    });
    if (roleError || isAdmin !== true) {
      return { ok: false as const, message: "You are not an administrator of this church." };
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("tier, name")
      .eq("id", data.tenant_id)
      .single();
    if (!tenant) return { ok: false as const, message: "Church not found." };

    // Free tier = 1 account (owner only)
    // Standard tier (basic) = up to 3 accounts (owner + 2 additional admins/ushers)
    // Pro tier (standard) = up to 10 accounts (admins, leaders, ushers)
    // Premium tier = up to 40 accounts (all roles including branch admins)
    const tierAllows: Record<string, string[]> = {
      free: [],
      basic: ["usher", "church_admin"],
      standard: ["usher", "church_admin", "leader"],
      premium: ["usher", "church_admin", "leader", "branch_admin"],
    };
    if (!tierAllows[tenant.tier]?.includes(data.role)) {
      return {
        ok: false as const,
        message: `The ${data.role.replace("_", " ")} role is not included in your ${planLabel(tenant.tier)} package.`,
      };
    }

    // Staff seats are part of the package, checked in the database.
    const { data: seatsFree } = await supabase.rpc("can_add_staff", { p_tenant: data.tenant_id });
    if (seatsFree !== true) {
      return {
        ok: false as const,
        message:
          "You have reached the staff account limit for your package. Upgrade to add more accounts.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or invite the auth user.
    let invitedId: string | null = null;
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
    );
    if (invited?.user) {
      invitedId = invited.user.id;
    } else if (inviteError) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
      if (!match) return { ok: false as const, message: "Could not invite that email address." };
      invitedId = match.id;
    }
    if (!invitedId) return { ok: false as const, message: "Could not invite that email address." };

    // Default permissions based on role if none provided
    const defaultPerms =
      data.role === "church_admin"
        ? {
            can_manage_members: true,
            can_manage_attendance: true,
            can_scan_qr: true,
            can_manage_services: true,
            can_manage_followups: true,
            can_view_reports: true,
            can_send_messages: true,
            can_manage_settings: false,
          }
        : data.role === "usher"
          ? {
              can_manage_members: false,
              can_manage_attendance: true,
              can_scan_qr: true,
              can_manage_services: false,
              can_manage_followups: false,
              can_view_reports: false,
              can_send_messages: false,
              can_manage_settings: false,
            }
          : {
              can_manage_members: true,
              can_manage_attendance: true,
              can_scan_qr: true,
              can_manage_services: false,
              can_manage_followups: true,
              can_view_reports: false,
              can_send_messages: false,
              can_manage_settings: false,
            };

    const finalPermissions = { ...defaultPerms, ...(data.permissions ?? {}) };

    const { error: insertError } = await supabaseAdmin.from("tenant_users").insert({
      tenant_id: data.tenant_id,
      user_id: invitedId,
      role: data.role,
      branch_id: data.branch_id ?? null,
      position_id: data.role === "leader" ? (data.position_id ?? null) : null,
      permissions: finalPermissions,
    });
    if (insertError && !insertError.message.includes("duplicate")) {
      return { ok: false as const, message: "That person already has this role." };
    }

    // Branded invitation from the church, when email sending is switched on.
    const { sendBrandedEmailNow } = await import("@/lib/queue.server");
    const branded = await sendBrandedEmailNow({
      tenantId: data.tenant_id,
      to: data.email,
      subject: `You have been invited to help run ${tenant.name}`,
      body: `You have been added to ${tenant.name} on Mene:Log as ${data.role.replace("_", " ")}.\n\nCheck your inbox for the Mene:Log sign-in link, then set your password and you are in. If you already have a Mene:Log login, just sign in as usual.`,
    });
    if (!branded.ok) {
      console.warn(`[accounts] branded invite not sent: ${branded.error ?? "unknown"}`);
    }

    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "account.invited",
      _target: data.email,
      _detail: { role: data.role, permissions: finalPermissions },
      _actor: userId,
    });

    return { ok: true as const };
  });

/**
 * Updates an account's role and customized granular permissions.
 */
export const updateAccountPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        account_id: z.string().uuid(),
        role: z.enum(["church_admin", "branch_admin", "leader", "usher"]).optional(),
        permissions: permissionsSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
      _tenant: data.tenant_id,
    });
    if (!isAdmin) {
      return { ok: false as const, message: "Only church administrators can modify permissions." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch account to verify it exists and is not owner
    const { data: targetAccount } = await supabaseAdmin
      .from("tenant_users")
      .select("id, role, user_id")
      .eq("id", data.account_id)
      .eq("tenant_id", data.tenant_id)
      .single();

    if (!targetAccount) {
      return { ok: false as const, message: "Team account not found." };
    }

    if (targetAccount.role === "owner") {
      return { ok: false as const, message: "Cannot modify the primary church owner account." };
    }

    const updatePayload: Record<string, unknown> = {
      permissions: data.permissions,
    };
    if (data.role) {
      updatePayload.role = data.role;
    }

    const { error: updateError } = await supabaseAdmin
      .from("tenant_users")
      .update(updatePayload as never)
      .eq("id", data.account_id)
      .eq("tenant_id", data.tenant_id);

    if (updateError) throw updateError;

    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "account.permissions_updated",
      _target: data.account_id,
      _detail: { role: data.role, permissions: data.permissions },
      _actor: userId,
    });

    return { ok: true as const };
  });

/**
 * Removes a staff account from the church workspace.
 */
export const removeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        account_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
      _tenant: data.tenant_id,
    });
    if (!isAdmin) {
      return { ok: false as const, message: "Only administrators can remove team accounts." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("tenant_users")
      .select("id, role")
      .eq("id", data.account_id)
      .eq("tenant_id", data.tenant_id)
      .single();

    if (!target) return { ok: false as const, message: "Account not found." };
    if (target.role === "owner")
      return { ok: false as const, message: "Cannot remove church owner." };

    const { error } = await supabaseAdmin
      .from("tenant_users")
      .delete()
      .eq("id", data.account_id)
      .eq("tenant_id", data.tenant_id);

    if (error) throw error;

    await supabaseAdmin.rpc("log_audit", {
      _tenant: data.tenant_id,
      _action: "account.removed",
      _target: data.account_id,
      _detail: {},
      _actor: userId,
    });

    return { ok: true as const };
  });
