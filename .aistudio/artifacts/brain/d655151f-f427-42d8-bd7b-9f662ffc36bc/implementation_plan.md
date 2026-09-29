# Implementation Plan: Registration Validation, 30-Day Trial, Automated Email & SMS Alert Suite

This plan establishes real-time field-level validation for check-in registration, extends the trial period to 30 days across all systems, and adds an email and SMS alert suite for trial expiration, payment events, branch registrations, and support ticketing.

---

## User Review Required

> [!IMPORTANT]
> - **Trial Expiration Schedule**: In accordance with your selection, trial warning emails will automatically be dispatched at **7 days remaining**, **3 days remaining**, and **on the day of expiry**, with direct upgrade links to Billing.
> - **Payment Notification Recipients**: Both the church administrator and `primehaven26@gmail.com` will receive alerts upon both payment success and payment failure.
> - **Support Ticket SMS Alerts**: Every newly submitted ticket will immediately dispatch an SMS to **`+233550160237`** and the church's primary contact phone using the **`Mene Log`** sender ID via Arkesel.

---

## Proposed Changes

### 1. Real-Time Field-Level Validation on Registration Form (`src/routes/c.$subdomain.tsx`)
- **Field Validation Architecture**:
  - Implement a dedicated validation state tracking touched status and field errors:
    - **Phone Number**: Format validation checking for valid Ghanaian (`024...`, `055...`, `020...`) or international E.164 formats (`+233...`), requiring 9–15 digits without invalid characters.
    - **Date of Birth**: Past date check, disallowing future dates or unrealistic ages (e.g. minimum 1 year, maximum 120 years).
    - **Full Name**: Minimum 2 characters with alphabetic presence.
    - **Email (Optional)**: If provided, enforce RFC standard email syntax.
    - **Required Dropdowns** (Gender, Marital Status): Validate non-empty selection upon touch.
  - **Inline Visual Feedback**:
    - Display field-level helper messages below each input in `text-rose-400 text-xs` when invalid, with subtle red input border highlighting (`border-rose-500/50 bg-rose-500/10`).
    - Provide green check indicator icons (`CheckCircle2`) when requirements are satisfied.
    - Disable the "Complete check-in" submission button with a tooltip until all required fields pass validation.

### 2. Extend Trial Period to 30 Days Across the Application
- **Database Stored Procedures (`upgrade-schema-attendance-and-features.sql`, `free-plan.sql`)**:
  - Update `provision_tenant` SQL function to set `trial_ends_at = now() + interval '30 days'` and `subscriptions.period_end = v_start + 30`.
  - Update `platform_create_tenant` SQL function for operator manual creation to use `30 days`.
- **UI Copy & Application Flows**:
  - `src/routes/onboarding.tsx`: Change all 14-day copy, badges, and step descriptions to 30 days.
  - `src/routes/onboarding-complete.tsx`: Change completion message to "Your email is verified and your 30-day trial has started."
  - `src/routes/_app/billing.tsx`: Update trial status banners and countdowns to reference 30-day trial.
  - `src/components/platform/PrimeGrowth.tsx` & `PrimeOverview.tsx`: Update platform operator console metrics from 14-day to 30-day trial reporting.
  - `src/routes/terms.tsx` & `src/routes/api/public/product-help.ts`: Update legal terms and automated AI assistant reference answers to 30 days.

### 3. Automated Email Alert Suite
- **Trial Expiration Alerts (`src/lib/billing.server.ts` & `src/routes/api/public/cron/messaging.ts`)**:
  - Create `checkAndSendTrialExpiryAlerts(supabaseAdmin)`:
    - Query active church tenants in trial with remaining days equal to 7, 3, or 0 (today).
    - Send branded HTML email reminders via Resend urging the administrator to choose a plan and upgrade to retain premium features, with a button pointing directly to `/billing`.
    - Idempotently track notifications in audit events (`tenant.trial_alert_sent`) to prevent duplicate emails within the same milestone window.
  - Call this runner in the daily messaging cron (`/api/public/cron/messaging`).
- **Payment Success & Failure Alerts (`src/routes/api/public/webhooks/paystack.ts` & `src/lib/receipt.server.ts`)**:
  - **Payment Success**: Send receipt and confirmation email to the church contact/billing email and carbon-copy/alert `primehaven26@gmail.com`.
  - **Payment Failure**: Add handling for Paystack `charge.failed` and `invoice.payment_failed` webhooks to dispatch instant failure alerts to both the church administrator and `primehaven26@gmail.com` with resolution instructions.
- **New Church Sign-Up Alerts**:
  - Ensure `sendNewChurchSignupAlert` in `src/lib/support.server.ts` is invoked reliably across all signup vectors (verified email completion, direct onboarding, and operator creation) to `primehaven26@gmail.com`.
- **Branch Church Sign-Up Alerts (`src/lib/branches.functions.ts`)**:
  - When `requestBranch` creates a pending branch church, dispatch an immediate email alert to the head office administrator's email and `parent.contact_email` notifying them of the new branch request and providing a link to `/branches` to approve or reject.

### 4. Support Ticket SMS Alert via Arkesel
- **SMS Trigger Implementation (`src/lib/support.server.ts` & `src/lib/support.functions.ts`)**:
  - Create `sendSupportTicketSmsAlert({ ticketId, churchName, churchPhone, subject, priority })`.
  - Use `sendSms` from `src/lib/messaging.server.ts` with:
    - **Sender ID**: `"Mene Log"`.
    - **Recipients**:
      1. Hardcoded support hotline: `"+233550160237"`.
      2. Church primary phone: `churchPhone` (normalized via international E.164 helper).
    - **Body Content**:
      `"[Mene:Log Support] New Ticket from {churchName}: {subject} ({priority}). Reply at menelog.site/support-console"`.
  - Trigger synchronously or fire-and-forget inside `submitTicket` upon successful ticket insertion.

---

## Verification Plan

### Automated Verification
1. **Compilation & Type Safety**:
   - Run `compile_applet` to verify that all React components, TanStack routes, and server functions compile cleanly without TypeScript or routing errors.
2. **Linter Check**:
   - Run `lint_applet` to ensure syntax integrity.

### Manual Verification Scenarios
1. **Registration Form Validation**:
   - Navigate to `/c/<subdomain>`.
   - Type an invalid phone number (e.g. `1234`) and future/invalid date of birth. Confirm red error borders and clear descriptive error text appear immediately under the respective inputs.
   - Correct the inputs to a valid phone (`0241234567`) and valid birth date. Confirm green checkmarks appear and submit is enabled.
2. **30-Day Trial Presentation**:
   - Navigate to `/onboarding` and test church creation preview. Verify all cards and headings state "30-day trial".
   - Check `/billing` and verify trial badges and trial banners display 30 days.
3. **Email Alerts**:
   - Inspect email payloads generated for branch registration and payment events.
   - Verify trial expiry cron executes without errors and queries 7-day, 3-day, and 0-day milestones.
4. **Support Ticket SMS**:
   - Submit a test support ticket from `/_app/support`.
   - Confirm that the SMS dispatch routine sends to both `+233550160237` and the church's phone with sender ID `"Mene Log"`.
