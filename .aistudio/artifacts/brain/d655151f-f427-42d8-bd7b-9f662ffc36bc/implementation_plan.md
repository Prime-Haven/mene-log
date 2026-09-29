# Revised Implementation Plan: Super Admin Autonomy, Database Purge & Settings Layout

This plan provides the complete PostgreSQL database schema and application architecture to give you full autonomy and control over the Prime Haven console.

---

## 1. Database Schema (`schema-update-super-admin-autonomy.sql`)

The schema upgrade script is saved in the project root at **`schema-update-super-admin-autonomy.sql`** and can be run directly in your Supabase SQL Editor:

```sql
-- 1. Global Platform System State (Maintenance Mode & Global Banner)
CREATE TABLE IF NOT EXISTS public.platform_system_state (
  id text PRIMARY KEY DEFAULT 'current',
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text DEFAULT 'Mene:Log is currently undergoing scheduled platform maintenance. Services will resume shortly.',
  pause_signups boolean NOT NULL DEFAULT false,
  global_banner_enabled boolean NOT NULL DEFAULT false,
  global_banner_message text DEFAULT '',
  global_banner_level text NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
  global_banner_show_on_checkin boolean NOT NULL DEFAULT true,
  global_banner_show_on_admin boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- 2. Complete Church Purge Stored Procedure (Cascading Hard Delete)
CREATE OR REPLACE FUNCTION public.platform_purge_tenant(
  p_tenant_id uuid,
  p_confirm_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
-- Deletes attendance_records, watch_sessions, messages, members, services,
-- support_tickets, structure_levels, backups, subscriptions, tenant_users,
-- branches, and the tenant record itself, recording an immutable audit event.
$$;

-- 3. Super Admin Profile Customization Function
CREATE OR REPLACE FUNCTION public.platform_update_my_profile(
  p_username text,
  p_display_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
-- Updates operator username and metadata in auth.users
$$;
```

---

## 2. Proposed Application Changes

### A. Settings Navigation: Collapsible Accordion Sidebar & Dropdown
- In `src/components/platform/ConsoleSettings.tsx`:
  - Replace the horizontal tabs with a **collapsible accordion sidebar** grouped into:
    - **Operator & Security**: Profile, username customization, password, 2FA.
    - **Platform Identity & Branding**: Prime Haven branding, login logos, system titles, and site metadata.
    - **Global Controls & Autonomy**: Maintenance mode switch, global broadcast banners, registration lockdown.
    - **Commercials & Tiers**: Pricing, discount coupons, plan matrix limits.
    - **Communications & Legal**: System email routing, SMS provider configuration, legal terms.
  - Add a **Quick-Jump Dropdown Selector** at the top of the settings page for fast navigation on both mobile and desktop.

### B. Complete Church Purge (Hard CRUD Delete)
- In `src/components/platform/PrimeChurches.tsx`:
  - Add a dedicated **Danger Zone** tab/card in the church detail sheet.
  - Button: **"Permanently Purge Church from Database"**.
  - Modal prompt: Requires the operator to type `<Church Name> DELETE` in an uppercase confirmation input before enabling the wipe action.
  - Dispatches `platform_purge_tenant` via Supabase RPC, cascading across all tables and instantly refreshing the churches list with toast confirmation.

### C. Direct Church Database Export & Backup
- In `src/components/platform/PrimeChurches.tsx`:
  - Add **"Export Complete Database Archive"** action button.
  - Generates a full structured `.json` data dump containing the church's profile, branches, members, services, and attendance logs for immediate download.

### D. Global Broadcast Banner & Maintenance Mode
- In `ConsoleSettings.tsx` under **Global Controls**:
  - Toggles for `global_banner_enabled`, severity levels (Info, Warning, Critical), display target (public check-in, church admin, or both).
  - Toggles for `maintenance_mode` and `pause_signups`.
- In `src/routes/_app.tsx` and `src/routes/c.$subdomain.tsx`:
  - Render a top banner if `global_banner_enabled` is active, styled according to the configured severity level.

---

## 3. Verification Plan

1. **Schema Execution**: Confirm that `schema-update-super-admin-autonomy.sql` executes in Supabase SQL editor without warnings.
2. **Settings Layout**: Verify the accordion sidebar groups expand/collapse and dropdown switches sections smoothly.
3. **Username Customization**: Update operator username and verify persistence.
4. **Hard Delete Test**: Test deleting a test church using `<Church Name> DELETE` verification and verify that all related rows are removed from the database.
5. **Database Export**: Click export on a church and inspect the downloaded JSON package.
6. **Global Banner Test**: Toggle banner in settings and verify rendering on check-in and dashboard pages.
