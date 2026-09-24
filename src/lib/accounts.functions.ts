import { planLabel } from "./pricing";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  tenant_id: z.string().uuid(),
  email: z.string().trim().email().max(160),
  role: z.enum(["church_admin", "branch_admin", "leader", "usher"]),
  branch_id: z.string().uuid().nullable(),
  position_id: z.string().uuid().nullable(),
});

/**
 * Invites a staff login. The caller's admin rights are re-checked against the
 * database with their own (RLS-scoped) client before any privileged work runs.
 */
export const inviteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
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

    const tierAllows: Record<string, string[]> = {
      free: [],
      basic: ["usher"],
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
        message: "You have used every staff login in your package. Move up a package to add more.",
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

    const { error: insertError } = await supabaseAdmin.from("tenant_users").insert({
      tenant_id: data.tenant_id,
      user_id: invitedId,
      role: data.role,
      branch_id: data.branch_id,
      position_id: data.role === "leader" ? data.position_id : null,
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
      _detail: { role: data.role },
      _actor: userId,
    });

    return { ok: true as const };
  });
