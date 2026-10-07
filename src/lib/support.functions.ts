import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  admin,
  audit,
  findOperator,
  hashPassword,
  listOperatorUsers,
  normaliseUsername,
  operatorEmail,
  rateLimit,
  validOperatorPassword,
} from "./operator.server";
import {
  authenticateSupportOperator,
  generateInstantSupportResponse,
  getOperatorSupportRole,
  sendSupportNotificationAlert,
  sendSupportTicketSmsAlert,
  sendTestSupportSmsAlert,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "./support.server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/* =========================================================================
   1. CHURCH-FACING SERVER FUNCTIONS
   ========================================================================= */

/** Helper to verify church admin status (owner or church_admin) */
async function assertChurchAdmin(
  supabaseClient: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
) {
  const { data: member, error } = await supabaseClient
    .from("tenant_users")
    .select("role, status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !member || (member.role !== "owner" && member.role !== "church_admin")) {
    throw new Error("Only church owners and church administrators can manage support tickets.");
  }
  return member;
}

/** Submit a new support ticket by a church admin */
export const submitChurchTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        branch_id: z.string().uuid().optional().nullable(),
        subject: z.string().trim().min(3).max(200),
        description: z.string().trim().min(10).max(5000),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await assertChurchAdmin(context.supabase, data.tenant_id, context.userId);

    // Get tenant details for alert email & SMS
    const { data: tenant } = await db
      .from("tenants")
      .select("name, contact_email, contact_phone")
      .eq("id", data.tenant_id)
      .maybeSingle();

    const churchName = tenant?.name || "Church Partner";

    // Insert ticket
    const { data: ticket, error: ticketError } = await db
      .from("support_tickets")
      .insert({
        tenant_id: data.tenant_id,
        branch_id: data.branch_id ?? null,
        submitted_by_user_id: context.userId,
        subject: data.subject,
        description: data.description,
        status: "open",
        priority: data.priority,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      console.error("[support] Ticket insert error:", ticketError);
      throw new Error("Could not create support ticket. Please try again.");
    }

    // Insert initial reply so conversation thread is established
    const { error: replyError } = await db.from("support_ticket_replies").insert({
      ticket_id: ticket.id,
      author_type: "church",
      author_id: context.userId,
      message: data.description,
      is_internal: false,
    });

    if (replyError) {
      console.error("[support] Initial reply error:", replyError);
    }

    // Generate instant real-time response from Mene:Log support desk (0s-1s delivery)
    const instantText = generateInstantSupportResponse({
      subject: data.subject,
      message: data.description,
      churchName,
      ticketId: ticket.id,
    });

    const { data: instantReply } = await db
      .from("support_ticket_replies")
      .insert({
        ticket_id: ticket.id,
        author_type: "support",
        author_id: "00000000-0000-0000-0000-000000000001",
        message: instantText,
        is_internal: false,
      })
      .select()
      .maybeSingle();

    // Fire email alert to primehaven26@gmail.com asynchronously
    sendSupportNotificationAlert({
      type: "new_ticket",
      churchName,
      ticketId: ticket.id,
      subject: data.subject,
      priority: data.priority,
      messageSnippet: data.description,
      submittedByEmail: tenant?.contact_email,
    }).catch((err) => console.error("[support alert] email error:", err));

    // Fire SMS alert to +233550160237 and branch/church phone recipients with 'Mene Log' sender ID
    sendSupportTicketSmsAlert({
      ticketId: ticket.id,
      churchName,
      churchPhone: tenant?.contact_phone,
      tenantId: data.tenant_id,
      branchId: data.branch_id ?? null,
      subject: data.subject,
      priority: data.priority,
    }).catch((err) => console.error("[support alert] sms error:", err));

    return { ok: true as const, ticketId: ticket.id, supportReply: instantReply };
  });

/** List all tickets for the active church */
export const listChurchTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await assertChurchAdmin(context.supabase, data.tenant_id, context.userId);

    const { data: tickets, error } = await db
      .from("support_tickets")
      .select(
        "id, tenant_id, submitted_by_user_id, subject, description, status, priority, created_at, updated_at, resolved_at",
      )
      .eq("tenant_id", data.tenant_id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[support] List church tickets error:", error);
      throw new Error("Could not load support tickets.");
    }

    // Get reply counts for each ticket
    const ticketIds = (tickets ?? []).map((t) => t.id);
    const replyCounts: Record<string, number> = {};
    if (ticketIds.length > 0) {
      const { data: replies } = await db
        .from("support_ticket_replies")
        .select("ticket_id")
        .in("ticket_id", ticketIds)
        .eq("is_internal", false);

      if (replies) {
        for (const r of replies) {
          replyCounts[r.ticket_id] = (replyCounts[r.ticket_id] || 0) + 1;
        }
      }
    }

    return (tickets ?? []).map((t) => ({
      ...t,
      reply_count: replyCounts[t.id] || 0,
    }));
  });

/** Get single ticket thread for church */
export const getChurchTicketThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ tenant_id: z.string().uuid(), ticket_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await assertChurchAdmin(context.supabase, data.tenant_id, context.userId);

    const { data: ticket, error: ticketError } = await db
      .from("support_tickets")
      .select(
        "id, tenant_id, submitted_by_user_id, subject, description, status, priority, created_at, updated_at, resolved_at",
      )
      .eq("id", data.ticket_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    if (ticketError || !ticket) {
      throw new Error("Ticket not found.");
    }

    // Church only sees non-internal replies
    const { data: replies, error: repliesError } = await db
      .from("support_ticket_replies")
      .select("id, ticket_id, author_type, author_id, message, is_internal, created_at")
      .eq("ticket_id", data.ticket_id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (repliesError) {
      console.error("[support] Get replies error:", repliesError);
      throw new Error("Could not load ticket conversation.");
    }

    return { ticket, replies: replies ?? [] };
  });

/** Reply to a ticket by the church */
export const replyChurchTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        ticket_id: z.string().uuid(),
        message: z.string().trim().min(2).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await assertChurchAdmin(context.supabase, data.tenant_id, context.userId);

    // Fetch ticket and tenant details
    const { data: ticket, error: ticketError } = await db
      .from("support_tickets")
      .select("id, subject, status, priority, tenant:tenants(name, contact_email)")
      .eq("id", data.ticket_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    if (ticketError || !ticket) {
      throw new Error("Ticket not found.");
    }

    // Insert church reply
    const { data: reply, error: replyError } = await db
      .from("support_ticket_replies")
      .insert({
        ticket_id: data.ticket_id,
        author_type: "church",
        author_id: context.userId,
        message: data.message,
        is_internal: false,
      })
      .select()
      .single();

    if (replyError || !reply) {
      console.error("[support] Insert reply error:", replyError);
      throw new Error("Could not send reply.");
    }

    // If ticket was resolved or closed, reopening to open when church responds
    const newStatus =
      ticket.status === "resolved" || ticket.status === "closed" ? "open" : ticket.status;

    await db
      .from("support_tickets")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        resolved_at: newStatus === "open" ? null : undefined,
      })
      .eq("id", data.ticket_id);

    const tenantInfo = ticket.tenant as unknown as { name?: string; contact_email?: string } | null;
    const churchName = tenantInfo?.name || "Church Partner";

    // Generate instant real-time response from Mene:Log support desk (0s-1s delivery)
    const instantText = generateInstantSupportResponse({
      subject: ticket.subject,
      message: data.message,
      churchName,
      ticketId: data.ticket_id,
    });

    const { data: instantReply } = await db
      .from("support_ticket_replies")
      .insert({
        ticket_id: data.ticket_id,
        author_type: "support",
        author_id: "00000000-0000-0000-0000-000000000001",
        message: instantText,
        is_internal: false,
      })
      .select()
      .maybeSingle();

    // Send email alert to primehaven26@gmail.com asynchronously
    sendSupportNotificationAlert({
      type: "church_reply",
      churchName,
      ticketId: data.ticket_id,
      subject: ticket.subject,
      priority: ticket.priority as SupportTicketPriority,
      messageSnippet: data.message,
      submittedByEmail: tenantInfo?.contact_email,
    }).catch((err) => console.error("[support alert] reply email error:", err));

    return { ok: true as const, reply, supportReply: instantReply };
  });

/** Get church and branch support SMS settings */
export const getSupportSmsConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tenant_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await assertChurchAdmin(context.supabase, data.tenant_id, context.userId);

    // 1. Fetch tenant level SMS settings
    const { data: tenant } = await db
      .from("tenants")
      .select("name, contact_phone, support_sms_enabled, support_sms_recipients, settings")
      .eq("id", data.tenant_id)
      .maybeSingle();

    // 2. Fetch branches for this tenant
    const { data: branches } = await db
      .from("branches")
      .select("id, name, city, is_default, support_sms_enabled, support_sms_recipients")
      .eq("tenant_id", data.tenant_id)
      .order("is_default", { ascending: false });

    const tenantSettings = (tenant?.settings as Record<string, unknown> | null) ?? {};
    const tenantEnabled =
      tenant?.support_sms_enabled ??
      (typeof tenantSettings.support_sms_enabled === "boolean"
        ? tenantSettings.support_sms_enabled
        : true);
    const tenantRecipients =
      tenant?.support_sms_recipients ??
      (typeof tenantSettings.support_sms_recipients === "string"
        ? tenantSettings.support_sms_recipients
        : "");

    return {
      churchName: tenant?.name ?? "",
      defaultPhone: tenant?.contact_phone ?? "",
      tenant: {
        enabled: tenantEnabled,
        recipients: tenantRecipients,
      },
      branches: (branches ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        city: b.city,
        isDefault: b.is_default,
        enabled: b.support_sms_enabled ?? true,
        recipients: b.support_sms_recipients ?? "",
      })),
    };
  });

/** Save church or branch support SMS settings */
export const saveSupportSmsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        branch_id: z.string().uuid().optional().nullable(),
        enabled: z.boolean(),
        recipients: z.string().trim().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await assertChurchAdmin(context.supabase, data.tenant_id, context.userId);

    if (data.branch_id) {
      const { error } = await db
        .from("branches")
        .update({
          support_sms_enabled: data.enabled,
          support_sms_recipients: data.recipients || null,
        })
        .eq("id", data.branch_id)
        .eq("tenant_id", data.tenant_id);

      if (error) {
        console.error("[support-sms] Update branch error:", error);
        throw new Error("Could not save branch SMS configuration.");
      }
    } else {
      // Update columns as well as settings jsonb for complete resilience
      const { data: currentTenant } = await db
        .from("tenants")
        .select("settings")
        .eq("id", data.tenant_id)
        .maybeSingle();

      const existingSettings = (currentTenant?.settings as Record<string, unknown> | null) ?? {};
      const updatedSettings = {
        ...existingSettings,
        support_sms_enabled: data.enabled,
        support_sms_recipients: data.recipients,
      };

      const { error } = await db
        .from("tenants")
        .update({
          support_sms_enabled: data.enabled,
          support_sms_recipients: data.recipients || null,
          settings: updatedSettings,
        })
        .eq("id", data.tenant_id);

      if (error) {
        console.error("[support-sms] Update tenant error:", error);
        throw new Error("Could not save church SMS configuration.");
      }
    }

    return { ok: true as const };
  });

/** Send a test SMS to configured phone numbers */
export const testSupportSmsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        recipients: z.array(z.string().trim().max(32)).max(5).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await assertChurchAdmin(context.supabase, data.tenant_id, context.userId);

    // Only text the numbers already saved in this church's settings,
    // never numbers supplied with the request.
    const { data: tenant } = await db
      .from("tenants")
      .select("name, support_sms_recipients")
      .eq("id", data.tenant_id)
      .maybeSingle();

    const churchName = tenant?.name || "Church Partner";
    const saved = String(tenant?.support_sms_recipients ?? "")
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (saved.length === 0) {
      return { ok: false, error: "Save at least one alert phone number before sending a test." };
    }
    const { rateLimit } = await import("./operator.server");
    const allowed = await rateLimit("support_sms_test", data.tenant_id, 3, 3600);
    if (!allowed) return { ok: false, error: "Too many test texts. Please try again in an hour." };
    const res = await sendTestSupportSmsAlert({ churchName, recipients: saved });

    return res;
  });

/* =========================================================================
   2. SUPPORT CONSOLE OPERATOR SERVER FUNCTIONS
   ========================================================================= */

/** Operator sign-in for the support console */
export const supportOperatorSignIn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        username: z.string().trim().min(1).max(60),
        password: z.string().min(1).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ip = (
      getRequestHeader("cf-connecting-ip") ??
      "unknown"
    )
      .split(",")[0]!
      .trim();

    return authenticateSupportOperator({
      username: data.username,
      password: data.password,
      ip,
    });
  });

/** Helper to assert support operator role from authenticated context */
async function assertSupportOperator(userId: string) {
  const role = await getOperatorSupportRole(userId);
  if (!role) {
    throw new Error("Support console access required.");
  }
  return role;
}

/** Check session and return operator profile and role */
export const getSupportOperatorSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await assertSupportOperator(context.userId);
    const db = await admin();
    const ops = await listOperatorUsers();
    const user = ops.find((u) => u.id === context.userId);
    const username = user?.app_metadata?.operator_username || "Operator";

    let displayName = username;
    if (role === "support_staff") {
      const { data: staffRow } = await db
        .from("support_staff")
        .select("display_name")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (staffRow?.display_name) displayName = staffRow.display_name;
    }

    return {
      userId: context.userId,
      username,
      displayName,
      role,
    };
  });

/** List all tickets across all tenants for Support Console */
export const listSupportConsoleTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["all", "open", "in_progress", "resolved", "closed"]).optional(),
        priority: z.enum(["all", "low", "normal", "high", "urgent"]).optional(),
        search: z.string().optional(),
      })
      .optional()
      .default({})
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSupportOperator(context.userId);
    const db = await admin();

    let query = db
      .from("support_tickets")
      .select(
        `
        id,
        tenant_id,
        submitted_by_user_id,
        subject,
        description,
        status,
        priority,
        created_at,
        updated_at,
        resolved_at,
        tenant:tenants(id, name, subdomain, contact_email)
      `,
      )
      .order("updated_at", { ascending: false });

    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }
    if (data?.priority && data.priority !== "all") {
      query = query.eq("priority", data.priority);
    }

    const { data: rawTickets, error } = await query;
    if (error) {
      console.error("[support-console] List tickets error:", error);
      throw new Error("Could not load support tickets.");
    }

    // Get reply counts
    const ticketIds = (rawTickets ?? []).map((t) => t.id);
    const replyCounts: Record<string, number> = {};
    if (ticketIds.length > 0) {
      const { data: replies } = await db
        .from("support_ticket_replies")
        .select("ticket_id")
        .in("ticket_id", ticketIds);

      if (replies) {
        for (const r of replies) {
          replyCounts[r.ticket_id] = (replyCounts[r.ticket_id] || 0) + 1;
        }
      }
    }

    let tickets = (rawTickets ?? []).map((t) => {
      const tenantInfo = t.tenant as unknown as {
        id?: string;
        name?: string;
        subdomain?: string;
        contact_email?: string;
      } | null;
      return {
        id: t.id,
        tenant_id: t.tenant_id,
        submitted_by_user_id: t.submitted_by_user_id,
        subject: t.subject,
        description: t.description,
        status: t.status as SupportTicketStatus,
        priority: t.priority as SupportTicketPriority,
        created_at: t.created_at,
        updated_at: t.updated_at,
        resolved_at: t.resolved_at,
        tenant_name: tenantInfo?.name ?? "Unknown Church",
        tenant_subdomain: tenantInfo?.subdomain ?? "",
        tenant_contact_email: tenantInfo?.contact_email ?? "",
        reply_count: replyCounts[t.id] || 0,
      };
    });

    if (data?.search && data.search.trim().length > 0) {
      const term = data.search.trim().toLowerCase();
      tickets = tickets.filter(
        (t) =>
          t.subject.toLowerCase().includes(term) ||
          t.tenant_name.toLowerCase().includes(term) ||
          t.tenant_subdomain.toLowerCase().includes(term) ||
          t.id.toLowerCase().includes(term),
      );
    }

    return tickets;
  });

/** Get single ticket thread with internal notes for support console */
export const getSupportConsoleTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticket_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSupportOperator(context.userId);
    const db = await admin();

    const { data: ticket, error: ticketError } = await db
      .from("support_tickets")
      .select(
        `
        id,
        tenant_id,
        submitted_by_user_id,
        subject,
        description,
        status,
        priority,
        created_at,
        updated_at,
        resolved_at,
        tenant:tenants(id, name, subdomain, contact_email, contact_phone, tier, status)
      `,
      )
      .eq("id", data.ticket_id)
      .maybeSingle();

    if (ticketError || !ticket) {
      throw new Error("Ticket not found.");
    }

    // Support console sees ALL replies, including internal notes
    const { data: replies, error: repliesError } = await db
      .from("support_ticket_replies")
      .select("id, ticket_id, author_type, author_id, message, is_internal, created_at")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });

    if (repliesError) {
      console.error("[support-console] Get replies error:", repliesError);
      throw new Error("Could not load ticket conversation.");
    }

    const tenantInfo = ticket.tenant as unknown as {
      id: string;
      name: string;
      subdomain: string;
      contact_email?: string;
      contact_phone?: string;
      tier?: string;
      status?: string;
    } | null;

    return {
      ticket: {
        id: ticket.id,
        tenant_id: ticket.tenant_id,
        submitted_by_user_id: ticket.submitted_by_user_id,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status as SupportTicketStatus,
        priority: ticket.priority as SupportTicketPriority,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        resolved_at: ticket.resolved_at,
      },
      tenant: tenantInfo,
      replies: replies ?? [],
    };
  });

/** Update ticket status or priority from support console */
export const updateSupportConsoleTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertSupportOperator(context.userId);
    const db = await admin();

    const patch: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };

    if (data.status) {
      patch["status"] = data.status;
      if (data.status === "resolved") {
        patch["resolved_at"] = new Date().toISOString();
      } else if (data.status === "open" || data.status === "in_progress") {
        patch["resolved_at"] = null;
      }
    }
    if (data.priority) {
      patch["priority"] = data.priority;
    }

    const { error } = await db.from("support_tickets").update(patch).eq("id", data.ticket_id);

    if (error) {
      console.error("[support-console] Update ticket error:", error);
      throw new Error("Could not update ticket.");
    }

    await audit(context.userId, "support.ticket_updated", {
      ticket_id: data.ticket_id,
      patch,
      role,
    });

    return { ok: true as const };
  });

/** Reply from support console (either public reply to church or private internal staff note) */
export const replySupportConsoleTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        message: z.string().trim().min(2).max(5000),
        is_internal: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertSupportOperator(context.userId);
    const db = await admin();

    const authorType = role === "super_admin" ? "super_admin" : "support";

    const { data: reply, error: replyError } = await db
      .from("support_ticket_replies")
      .insert({
        ticket_id: data.ticket_id,
        author_type: authorType,
        author_id: context.userId,
        message: data.message,
        is_internal: data.is_internal,
      })
      .select()
      .single();

    if (replyError || !reply) {
      console.error("[support-console] Insert reply error:", replyError);
      throw new Error("Could not post reply.");
    }

    // Touch ticket updated_at
    await db
      .from("support_tickets")
      .update({
        updated_at: new Date().toISOString(),
        ...(data.is_internal ? {} : { status: "in_progress" }),
      })
      .eq("id", data.ticket_id);

    await audit(context.userId, "support.ticket_replied", {
      ticket_id: data.ticket_id,
      is_internal: data.is_internal,
      role,
    });

    return { ok: true as const, reply };
  });

/* =========================================================================
   3. SUPPORT STAFF MANAGEMENT (SUPER ADMIN ONLY)
   ========================================================================= */

/** List support staff accounts — any support operator may view the team;
 *  only Super Admins can add or remove accounts. */
export const listSupportStaffAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSupportOperator(context.userId);

    const db = await admin();
    const { data: staff, error } = await db
      .from("support_staff")
      .select("id, user_id, username, display_name, email, created_at, created_by")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[support-staff] List error:", error);
      throw new Error("Could not load support staff list.");
    }

    return staff ?? [];
  });

/** Create a new support staff operator */
export const createSupportStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        username: z.string().trim().min(3).max(40),
        display_name: z.string().trim().min(2).max(60),
        password: z.string().min(8).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertSupportOperator(context.userId);
    if (role !== "super_admin") {
      throw new Error("Only Super Admins can add support staff.");
    }

    if (!validOperatorPassword(data.password)) {
      throw new Error("Password must be 8 to 72 characters.");
    }

    const username = normaliseUsername(data.username);
    if (await findOperator(username)) {
      throw new Error("An operator with that username already exists.");
    }

    const db = await admin();
    const email = operatorEmail(username);

    // Create operator user in Supabase auth
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: crypto.randomUUID() + "Aa1!",
      email_confirm: true,
      app_metadata: {
        operator: true,
        operator_username: username,
        operator_display_name: data.display_name,
        operator_hash: hashPassword(data.password),
        role: "support_staff",
      },
    });

    if (error || !created.user) {
      console.error("[support-staff] Create auth user error:", error);
      throw new Error("Could not create operator user account.");
    }

    // Insert into support_staff table
    const { data: record, error: staffError } = await db
      .from("support_staff")
      .insert({
        user_id: created.user.id,
        username,
        display_name: data.display_name,
        email,
        created_by: context.userId,
      })
      .select()
      .single();

    if (staffError) {
      console.error("[support-staff] Insert staff table error:", staffError);
      await db.auth.admin.deleteUser(created.user.id);
      throw new Error("Could not save support staff record.");
    }

    await audit(context.userId, "support.staff_created", {
      username,
      display_name: data.display_name,
    });

    return { ok: true as const, staff: record };
  });

/** Remove a support staff account */
export const removeSupportStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ staff_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await assertSupportOperator(context.userId);
    if (role !== "super_admin") {
      throw new Error("Only Super Admins can remove support staff.");
    }

    const db = await admin();
    const { data: staff, error: findError } = await db
      .from("support_staff")
      .select("id, user_id, username")
      .eq("id", data.staff_id)
      .maybeSingle();

    if (findError || !staff) {
      throw new Error("Support staff record not found.");
    }

    await db.from("support_staff").delete().eq("id", data.staff_id);
    await db.auth.admin.deleteUser(staff.user_id);

    await audit(context.userId, "support.staff_removed", {
      username: staff.username,
    });

    return { ok: true as const };
  });
