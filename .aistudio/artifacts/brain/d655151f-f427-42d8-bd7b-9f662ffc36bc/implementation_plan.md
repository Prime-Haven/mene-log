# Revised Implementation Plan: Support Ticket SMS Configuration Panel & Database Schema

This plan establishes a dedicated configuration panel in the admin dashboard where users can toggle SMS notifications for support tickets and customize multiple recipient phone numbers for their branch and main church, and provides the exact PostgreSQL schema script to run in Supabase.

---

## User Review Required

> [!IMPORTANT]
> - **Database Schema Migration**: A dedicated, idempotent SQL migration script (`schema-update-support-sms.sql`) will be generated, adding `support_sms_enabled` and `support_sms_recipients` columns to both `public.tenants` and `public.branches`, and linking `support_tickets.branch_id`.
> - **Dual Access Points**: The panel will be embedded in both **`/_app/settings`** and accessible directly within **`/_app/support`** via a "Notification Preferences" action button.
> - **Multi-Number Support**: Supports multiple comma-separated numbers (e.g. `0244123456, 0550160237, +233201112233`), validating each in real-time.
> - **Verified Sender ID**: All notifications and test alerts are guaranteed to dispatch with the **`Mene Log`** sender ID via Arkesel.

---

## Proposed Database Schema (`schema-update-support-sms.sql`)

```sql
-- 1. Tenant-level SMS notification controls
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS support_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_sms_recipients text;

-- 2. Branch-level custom SMS notification controls
ALTER TABLE public.branches 
  ADD COLUMN IF NOT EXISTS support_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_sms_recipients text;

-- 3. Link support tickets to branches for branch-specific routing
ALTER TABLE public.support_tickets 
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_tickets_branch_idx ON public.support_tickets (branch_id);
```

---

## Proposed Application Changes

### 1. Backend Server Functions (`src/lib/support.server.ts` & `src/lib/support.functions.ts`)
- **Server Functions**:
  - `saveSupportSmsConfig`: Persists `support_sms_enabled` and `support_sms_recipients` for either the active church tenant or the selected branch.
  - `getSupportSmsConfig`: Retrieves the current SMS alert settings for the church and its branches.
  - `sendTestSupportSms`: Validates provided phone numbers and dispatches a test SMS:
    `"[Mene:Log Support] Test notification: SMS ticket alerts are configured successfully."` with sender ID `"Mene Log"`.
- **Dispatcher Update (`sendSupportTicketSmsAlert`)**:
  - Check `support_sms_enabled`. If disabled, skip external SMS dispatch and only alert internal hotline `+233550160237`.
  - Check branch-specific `support_sms_recipients`; if blank, fall back to church `support_sms_recipients`, and then `contact_phone`.
  - Normalize and send SMS to all unique recipients using the `"Mene Log"` sender ID.

### 2. UI Component (`src/components/SupportSmsConfigPanel.tsx`)
- **Live Master Switch**: Toggle for enabling/disabling ticket SMS alerts.
- **Branch Selector**: If church has multiple branches, allow switching between "Main Church" and specific branch profiles.
- **Multiple Recipient Field**: Comma-separated phone number input with immediate validation pill preview.
- **Sender ID Badge**: Shows locked label: `Sender ID: Mene Log (System Verified)`.
- **Test SMS Trigger**: Sends an instant test SMS to all configured numbers to verify delivery.
- **Save Action**: Saves to database with instant toast feedback.

### 3. Dashboard Integration
- **Settings Page (`src/routes/_app/settings.tsx`)**: Placed in the Communication / Alerts section.
- **Support Page (`src/routes/_app/support.tsx`)**: Accessible via a prominent "Notification Preferences" button with modal drawer.

---

## Verification Plan

### Automated Verification
- Run `compile_applet` to confirm build succeeds without TypeScript or routing errors.
- Run `lint_applet` for code style and imports.

### Manual Verification Scenarios
1. **Schema Generation**: Verify `schema-update-support-sms.sql` is created in root and contains clean, safe SQL statements.
2. **Settings Persistence**: Toggle notifications on/off and add multiple numbers in `/settings`. Reload page to confirm persistence.
3. **Support Page Modal**: Open preferences from `/support`, change numbers, and click "Send Test SMS" to verify API dispatch.
4. **Ticket Creation Flow**: File a new ticket from `/support` and verify that all branch recipients and `+233550160237` receive the notification with sender `"Mene Log"`.
