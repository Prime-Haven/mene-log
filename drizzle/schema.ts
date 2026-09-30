import {
  pgTable,
  uuid,
  text,
  boolean,
  date,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const appRoleEnum = pgEnum("app_role", [
  "owner",
  "church_admin",
  "branch_admin",
  "leader",
  "usher",
  "platform_admin",
]);

export const tenantTierEnum = pgEnum("tenant_tier", ["basic", "standard", "premium"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "grace", "suspended", "closed"]);
export const memberStatusEnum = pgEnum("member_status", [
  "first_timer",
  "active",
  "archived",
  "anonymised",
]);
export const genderTypeEnum = pgEnum("gender_type", ["male", "female", "other"]);
export const attendanceMethodEnum = pgEnum("attendance_method", [
  "scan",
  "self_checkin",
  "manual",
  "corrected",
]);
export const accountStatusEnum = pgEnum("account_status", ["active", "suspended"]);

// Custom bytea type
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Tenants Table
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  tier: tenantTierEnum("tier").notNull().default("basic"),
  status: tenantStatusEnum("status").notNull().default("active"),
  logoPath: text("logo_path"),
  backgroundPath: text("background_path"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  groupVocabulary: text("group_vocabulary").notNull().default("Group"),
  parentTenantId: uuid("parent_tenant_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Branches Table
export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  city: text("city"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tenant Users (Accounts) Table
export const tenantUsers = pgTable("tenant_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  role: appRoleEnum("role").notNull(),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  positionId: uuid("position_id"),
  permissions: jsonb("permissions").notNull().default({}),
  status: accountStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Structure Levels
export const structureLevels = pgTable("structure_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rank: integer("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Positions
export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  levelId: uuid("level_id")
    .notNull()
    .references(() => structureLevels.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  groupName: text("group_name").notNull(),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Members Table (with member_code)
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  positionId: uuid("position_id").references(() => positions.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  memberCode: text("member_code"), // Unique member code for QR and fallback check-in
  phone: text("phone"),
  email: text("email"),
  dateOfBirth: date("date_of_birth"),
  gender: genderTypeEnum("gender"),
  maritalStatus: text("marital_status"),
  residentialArea: text("residential_area"),
  occupation: text("occupation"),
  educationLevel: text("education_level"),
  isMinor: boolean("is_minor").notNull().default(false),
  isLeader: boolean("is_leader").notNull().default(false),
  status: memberStatusEnum("status").notNull().default("active"),
  joinedOn: date("joined_on").notNull().defaultNow(),
  invitedByLeaderId: uuid("invited_by_leader_id"),
  importBatchId: uuid("import_batch_id"),
  messagingOptOut: boolean("messaging_opt_out").notNull().default(false),
  whatsappOptOut: boolean("whatsapp_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Services Table (supports Regular Services and Special Programs)
export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  name: text("name").notNull(), // "Sunday Service", "Midweek Service", "Prayer Service", or Special Program Name
  serviceType: text("service_type").notNull().default("regular"), // "regular" | "special_program"
  serviceDate: date("service_date").defaultNow(),
  isOpen: boolean("is_open").notNull().default(true),
  streamUrl: text("stream_url"),
  onlineMinMinutes: integer("online_min_minutes").notNull().default(20),
  description: text("description"),
  speaker: text("speaker"),
  theme: text("theme"), // Custom theme/dubbing, e.g. "Overflowing Grace", "Youth Awakening"
  isDefault: boolean("is_default").notNull().default(false), // Permanent weekly template (Sunday, Midweek, Prayer)
  targetAttendance: integer("target_attendance"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Attendance Table
export const attendance = pgTable("attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  positionId: uuid("position_id"),
  scannedByUserId: uuid("scanned_by_user_id"),
  method: attendanceMethodEnum("method").notNull().default("scan"),
  designation: text("designation").notNull().default("member"),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

// QR Tokens Table
export const qrTokens = pgTable("qr_tokens", {
  tokenHash: bytea("token_hash").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  tokenEnc: bytea("token_enc"),
  kind: text("kind").default("member"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// Subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" })
    .unique(),
  tier: tenantTierEnum("tier").notNull().default("basic"),
  pendingTier: tenantTierEnum("pending_tier"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  paymentMethod: text("payment_method"),
  autoRenew: boolean("auto_renew").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Payments
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  reference: text("reference").notNull().unique(),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("GHS"),
  tier: tenantTierEnum("tier").notNull(),
  status: text("status").notNull().default("pending"),
  channel: text("channel"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  branches: many(branches),
  users: many(tenantUsers),
  members: many(members),
  services: many(services),
  subscription: one(subscriptions, {
    fields: [tenants.id],
    references: [subscriptions.tenantId],
  }),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [members.tenantId],
    references: [tenants.id],
  }),
  branch: one(branches, {
    fields: [members.branchId],
    references: [branches.id],
  }),
  attendances: many(attendance),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [services.tenantId],
    references: [tenants.id],
  }),
  attendances: many(attendance),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  service: one(services, {
    fields: [attendance.serviceId],
    references: [services.id],
  }),
  member: one(members, {
    fields: [attendance.memberId],
    references: [members.id],
  }),
}));

// Support System Enums
export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const supportTicketPriorityEnum = pgEnum("support_ticket_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const supportReplyAuthorTypeEnum = pgEnum("support_reply_author_type", [
  "church",
  "support",
  "super_admin",
]);

// Support Staff Table
export const supportStaff = pgTable("support_staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

// Support Tickets Table
export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  submittedByUserId: uuid("submitted_by_user_id").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: supportTicketStatusEnum("status").notNull().default("open"),
  priority: supportTicketPriorityEnum("priority").notNull().default("normal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// Support Ticket Replies Table
export const supportTicketReplies = pgTable("support_ticket_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  authorType: supportReplyAuthorTypeEnum("author_type").notNull(),
  authorId: uuid("author_id").notNull(),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [supportTickets.tenantId],
    references: [tenants.id],
  }),
  replies: many(supportTicketReplies),
}));

export const supportTicketRepliesRelations = relations(supportTicketReplies, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [supportTicketReplies.ticketId],
    references: [supportTickets.id],
  }),
}));

// Platform Audit Events Table (Prime Haven Super Admin operations log)
export const platformAuditEvents = pgTable("platform_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").notNull(),
  actorUsername: text("actor_username"),
  action: text("action").notNull(),
  category: text("category").notNull().default("system"),
  severity: text("severity").notNull().default("info"),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  tenantName: text("tenant_name"),
  detail: jsonb("detail").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
