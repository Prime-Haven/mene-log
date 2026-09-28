# Implementation Plan: Mene:Log Support Ticket System

Build an enterprise-grade, secure, multi-tenant Support Ticket System for Mene:Log encompassing database tables with strict Row-Level Security, a church administrator support center in the main app, a dedicated operator support console (`/support-console`) with operator authentication and role-based gating, and automated staff email alerts via Resend.

---

## 1. Architecture & Security Overview

```
                                      +---------------------------------------------+
                                      |            Church Tenant Admin              |
                                      |   (owner or church_admin role in _app)      |
                                      +---------------------+-----------------------+
                                                            |
                                               Creates / views tickets
                                                & replies to threads
                                                            v
+-----------------------+              +--------------------+-----------------------+
|  Super Admin Operator |              |             PostgreSQL Database            |
| (platform_admins)     |              |  - support_tickets (RLS: own tenant/staff) |
| - Full oversight      |              |  - support_ticket_replies (internal notes) |
| - Manage support staff|              |  - support_staff (parallel operator table) |
+-----------+-----------+              +--------------------+-----------------------+
            |                                               ^
            | Signs into /support-console                   |
            v                                               |
+-----------+-----------+                                   |
| Support Staff Operator|-----------------------------------+
| (support_staff table) |   Views all tenants, updates status/priority,
| - Gated: no billing,  |   posts public replies and internal notes
|   no tier changes     |
+-----------+-----------+
            |
            | On new ticket or church reply
            v
+-----------+-----------------------------------------------------------------------+
| Resend Email Notification -> Sent to primehaven26@gmail.com with deep link        |
+-----------------------------------------------------------------------------------+
```

---

## 2. Proposed Changes & Implementation Phases

### Phase A: Database Schema & Row-Level Security (`support-tickets-schema.sql`)
1. **Enums & Tables**:
   - `support_ticket_status`: `'open'`, `'in_progress'`, `'resolved'`, `'closed'`.
   - `support_ticket_priority`: `'low'`, `'normal'`, `'high'`, `'urgent'`.
   - `support_ticket_author_type`: `'church'`, `'support'`, `'super_admin'`.
   - `public.support_staff`:
     - `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
     - `created_at timestamptz NOT NULL DEFAULT now()`
     - `created_by uuid REFERENCES auth.users(id)`
   - `public.support_tickets`:
     - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
     - `tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE`
     - `submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id)`
     - `subject text NOT NULL`
     - `description text NOT NULL`
     - `status text NOT NULL DEFAULT 'open'` (check in open, in_progress, resolved, closed)
     - `priority text NOT NULL DEFAULT 'normal'` (check in low, normal, high, urgent)
     - `created_at timestamptz NOT NULL DEFAULT now()`
     - `updated_at timestamptz NOT NULL DEFAULT now()`
     - `resolved_at timestamptz`
   - `public.support_ticket_replies`:
     - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
     - `ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE`
     - `author_type text NOT NULL` (check in church, support, super_admin)
     - `author_id uuid NOT NULL REFERENCES auth.users(id)`
     - `author_name text`
     - `message text NOT NULL`
     - `is_internal boolean NOT NULL DEFAULT false` (private staff notes)
     - `created_at timestamptz NOT NULL DEFAULT now()`
2. **Security Functions & RLS**:
   - Helper function `public.is_support_or_platform_admin()` returning boolean if user is in `support_staff` OR `platform_admins`.
   - `support_tickets` RLS:
     - Church members with `owner` or `church_admin` role in `tenant_memberships` can `SELECT` and `INSERT` tickets matching their `tenant_id`.
     - Support staff and platform admins can `SELECT` and `UPDATE` (status, priority, resolved_at) all tickets across all tenants.
   - `support_ticket_replies` RLS:
     - Church admins can `SELECT` replies for their tenant's tickets where `is_internal = false`, and `INSERT` replies with `author_type = 'church'` and `is_internal = false`.
     - Support staff and platform admins can `SELECT` and `INSERT` all replies (including `is_internal = true` staff notes).
3. **Audit Logging**:
   - Integrated audit logs via `public.log_audit` for ticket creation, status transitions, and replies.

---

### Phase B: Server Functions & Resend Notifications (`src/lib/support.functions.ts`)
1. **Server Functions**:
   - `listChurchTickets`: Returns tickets for the active tenant, with reply counts and last activity.
   - `getChurchTicketThread`: Returns single ticket and its public replies (`is_internal = false`).
   - `createChurchTicket`: Creates ticket for tenant, sends immediate Resend notification to `primehaven26@gmail.com`.
   - `replyToChurchTicket`: Adds church reply, sets status back to `in_progress` or `open` if resolved, triggers Resend notification.
   - `supportConsoleSignIn`: Dual-gate operator authentication verifying user in `support_staff` OR `platform_admins`, rate-limited and MFA-verified.
   - `listAllSupportTickets`: Returns paginated/filtered tickets across all tenants (with tenant name and subdomain) for operators.
   - `getOperatorTicketDetails`: Returns full ticket, all replies (including private internal notes), and tenant profile.
   - `updateTicketStatusAndPriority`: Allows operators to change status/priority with audit record.
   - `postOperatorReply`: Handles both public response to the church and private staff notes (`is_internal = true`).
   - `manageSupportStaff`: Allows Super Admins to list, add, and remove support staff accounts.
2. **Email Alerts via Resend**:
   - Direct integration using `sendEmail` in `messaging.server.ts`.
   - Sent to: `primehaven26@gmail.com`.
   - From: `Mene:Log <support@menelog.site>`.
   - Formatted with clean Mene:Log brand header, church details, subject, excerpt, and one-click direct URL:
     `https://<domain>/support-console?ticket=<ticket_id>`.

---

### Phase C: Church-Facing Support Center (`src/routes/_app/support.tsx` & Sidebar)
1. **Sidebar Navigation**:
   - Add "Support" item to `src/routes/_app/route.tsx` under "Administration" (visible to church owners and administrators).
   - Icon: `HelpCircle` or `LifeBuoy`.
2. **Page Architecture**:
   - Header with eyebrow `Assistance & Inquiries`, title `Support Center`, and `Submit Ticket` button.
   - Ticket list with status badges (`Open`, `In Progress`, `Resolved`, `Closed`), priority badges, submission timestamps, and reply counts.
   - Filter chips for status (`All`, `Open`, `In Progress`, `Resolved`).
   - Thread view:
     - Clear original request card with submitter name and timestamp.
     - Threaded replies stream with distinct styling for Church vs. Mene:Log Support Staff.
     - Quick reply input box with Markdown / rich multiline text.
   - "New Ticket" modal dialog:
     - Subject, Priority (`Normal`, `Low`, `High`, `Urgent`), Description with guidance on what information helps resolve issues faster.

---

### Phase D: Operator Support Console (`src/routes/support-console.tsx`)
1. **Auth & Protection**:
   - Standalone top-level route (outside `_app` and `super-admin`).
   - Uses username + password operator entrance with two-step verification.
   - Verifies whether operator is `support_staff` or `super_admin`.
   - Gated view: Support staff cannot access billing, feature flags, or church database tools.
2. **Operator Interface**:
   - High-density SaaS dashboard complying with `frontend-design` & `3_saas_dashboard.md`.
   - Metric overview: Total Open, In Progress, Urgent / High Priority, Avg Resolution time.
   - Search & filters: Filter by Church / Tenant name, status, priority, or ticket search.
   - Split-pane / Drawer layout:
     - Left: Dense ticket queue with unread badges, church subdomain tags, priority indicators.
     - Right: Interactive ticket workspace:
       - Status dropdown selector (`Open`, `In Progress`, `Resolved`, `Closed`).
       - Priority selector (`Low`, `Normal`, `High`, `Urgent`).
       - Conversation stream with internal notes clearly marked in high-contrast slate/amber.
       - Dual-mode composer: Switch between "Reply to Church" (public) and "Internal Staff Note" (private to support/super admin).
   - Staff Management tab (Super Admin only):
     - Displays active support staff operators.
     - Form to add new support operator username/password.
     - Ability to revoke support staff access.

---

## 3. Verification Plan

1. **Database Script**:
   - Verify SQL migration execution and schema validation.
2. **Linter & Type Checking**:
   - Run `lint_applet` and check for clean TypeScript compilation.
3. **Applet Compilation**:
   - Run `compile_applet` to confirm zero compilation errors.
4. **End-to-End Workflow Testing**:
   - Test church admin ticket submission from `/_app/support`.
   - Verify Resend alert dispatch logic with direct console link.
   - Test operator authentication on `/support-console`.
   - Test ticket status transitions, public replies, and private internal notes.
   - Confirm support staff accounts cannot access `/platform` or super-admin endpoints.
