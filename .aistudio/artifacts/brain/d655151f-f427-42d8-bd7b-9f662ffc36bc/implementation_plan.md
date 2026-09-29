# Mene:Log Implementation Plan: Attendance, Branch Portal, Online Streaming, and Platform Enhancements

This plan outlines the architecture, file modifications, and verification steps to address all 10 user requirements requested for Mene:Log.

---

## User Review Required

> [!IMPORTANT]
> - **Member Codes for Online Attendance**: The streaming endpoint (`/live/$subdomain`) and backend heartbeat (`pingWatch`, `startWatch`) will now accept member codes in the active format (`ML-XXXXX`) as well as existing QR token hashes.
> - **Branch Portal on Check-in Pages**: The Branch tab on `/c/$subdomain` will now feature a dual-mode portal (Branch Registration with Administrator Password + Branch Administrator Sign-In).
> - **Universal Feature Lock Messaging**: Any locked feature gate across church accounts will use a universal upgrade message without mentioning specific tier labels (e.g., "Upgrade your account to unlock this feature").
> - **New Church Sign-Up Alerts**: Every completed church registration will immediately trigger an email alert to `primehaven26@gmail.com`.

---

## Proposed Changes

### 1. Online Attendance & Member Code Fix
- **`src/lib/watch.functions.ts`**:
  - Update `base` input schema to accept member codes (`ML-...` alphanumeric codes) or legacy 32-character tokens.
  - In `resolveViewer()`, look up the member first by `members.member_code` (case-insensitive) under the church tenant, falling back to `qr_tokens.token_hash`.
  - Ensure `watch_sessions` logs watch time and auto-records attendance once the minimum watched duration is reached.
- **`src/routes/live.$subdomain.tsx`**:
  - Update client validation to allow `ML-...` member codes without throwing a "32-character" format error.
  - Provide clear UI cues displaying the member code format shown on cards.
- **`src/routes/_app/services.tsx` & `src/routes/_app/attendance.tsx`**:
  - Add an integrated **Online Attendance** panel showing:
    - Active live service streams with status (Live / Offline)
    - Real-time online viewer headcounts & minutes watched
    - Attendees recorded via online streaming with an "Online Attendee" badge
    - Stream URL configuration and minimum watch time requirements

### 2. Check-in Page UI & White-on-White Contrast Fix
- **`src/routes/c.$subdomain.tsx`**:
  - Resolve white-on-white text in the Leader Area and form cards by replacing low-contrast classes with explicit high-contrast theme tokens (`text-foreground`, `text-ink`, `bg-card/90`, `border-border`).
  - Standardize text contrast on both dark hero backgrounds and light card surfaces.
  - Harmonize tab switches (`Member Check-in`, `Leader Area`, `Branch Portal`) to fix height and width inconsistencies, avoiding layout jumps.

### 3. Leader Registration Fix
- **`src/lib/leaders.functions.ts`**:
  - Enhance `registerLeader`:
    - Ensure church leader access codes are verified safely; if a church does not have a code set yet, generate an initial code or provide clear actionable error messaging.
    - Check if an auth user already exists before failing; handle existing user credentials or provide a clear prompt to sign in.
    - Validate leader type selection and sanitize input fields.

### 4. Branch Portal with Admin Password & Sign-in on Check-in Page
- **`src/lib/branches.functions.ts`**:
  - Update `requestBranch` to accept `admin_password` and create/prepare the branch administrator user account upon branch submission.
- **`src/routes/c.$subdomain.tsx` (`BranchArea`)**:
  - Add sub-tabs to the Branch section:
    1. **Register Branch**: Collects branch campus name, subdomain, location, admin contact details, and password with show/hide toggle.
    2. **Branch Admin Login**: Allows branch administrators to sign in directly from the check-in page and be routed to their branch console.

### 5. UI Harmonization & Tab Sizing
- **`src/routes/c.$subdomain.tsx`**:
  - Establish a consistent container min-height and shared padding for all tab views.
  - Smooth out transitions between Member, Leader, and Branch views to prevent layout jumps.

### 6. New Church Signup Email Alert to `primehaven26@gmail.com`
- **`src/lib/operator.server.ts` / `src/lib/settings.server.ts`**:
  - Create a dedicated helper `sendNewChurchSignupAlert({ churchName, subdomain, contactEmail, contactPhone, tier })`.
  - Wire this helper into:
    - `src/routes/onboarding-complete.tsx` (verified onboarding completion)
    - `src/lib/billing.functions.ts` / `onboarding.tsx` (direct church provisioning)
    - `platform_create_tenant` (operator manual church provisioning)
  - Sends a structured email to `primehaven26@gmail.com` via Resend detailing the new church registration.

### 7. Show / Hide Password Icon for All Password Fields
- **`src/components/PasswordField.tsx`**:
  - Add an interactive eye icon (`Eye` / `EyeOff` from `lucide-react`) allowing users to toggle between masked and plain text password viewing.
  - Export both full checklist `PasswordField` and a reusable `PasswordInput` component.
- **Replace plain password inputs across the application**:
  - `src/routes/auth.tsx`
  - `src/routes/onboarding.tsx`
  - `src/routes/c.$subdomain.tsx` (Leader login & register, Branch register & login)
  - `src/routes/super-admin.tsx` / `src/routes/support-console.tsx`
  - `src/routes/_app/accounts.tsx`

### 8. Universal Feature Lock & Upgrade Messaging
- **`src/components/FeatureGate.tsx`**:
  - Remove specific tier references ("part of the Standard/Pro/Premium package").
  - Use a universal prompt:
    > "Upgrade your account to have access to this feature. All your current data and records remain intact — upgrade anytime to unlock it immediately."
- **Audit other upgrade banners**:
  - `src/routes/_app/accounts.tsx`
  - `src/routes/_app/reports.tsx`
  - `src/routes/_app/support.tsx`
  - Ensure no lock screen mentions specific tier names unless the user is actively on the billing/pricing screen.

### 9. & 10. Comprehensive Super Admin Features Page with Grouped Suites
- **`src/lib/entitlements.ts`**:
  - Define structured feature groups:
    1. **Check-in & QR Access**: `checkin`, `qr`
    2. **Membership & Directory**: `members`, `import`
    3. **Services & Online Streaming**: `services`, `watch_live`
    4. **Leadership & Cell Hierarchy**: `leaders`, `structure`, `groups`, `leader_hierarchy`
    5. **Member Care & Follow-ups**: `followups`
    6. **Messaging & Broadcasts**: `email`, `sms`, `whatsapp`, `broadcasts`, `automations`
    7. **Church Customization & Branding**: `branding`
    8. **Campuses & Branches**: `branches`
    9. **Analytics & Activity Audit**: `reports_basic`, `reports_advanced`, `audit`
    10. **Ask Mene AI Assistant**: `ask_mene`, `ask_mene_pro`
    11. **Technical Support**: `support`
- **`src/components/platform/PrimeFeatures.tsx`**:
  - Render grouped feature suites with category headers and clear descriptions.
  - Provide live interactive toggle switches for each tier (Free, Standard, Pro, Premium).
  - Toggling a feature suite immediately updates the authoritative `plan_config` in Supabase, making the feature available or unavailable in real time.

---

## Verification Plan

### Automated Build & Lint Verification
1. Run `compile_applet` to ensure TypeScript compilation, TanStack router routes, and build assets succeed without error.
2. Run `lint_applet` to check for syntax or unused variable regressions.

### Manual Verification Walkthrough
1. **Online Attendance & Member Code**:
   - Navigate to `/live/<subdomain>`.
   - Enter a member code like `ML-10023` or standard code. Confirm that it validates and starts the live stream.
   - Navigate to `/services` and `/attendance` in the church dashboard. Verify the new Online Attendance section shows stream status and attendee metrics.
2. **Check-in Page UI & White-on-White**:
   - Navigate to `/c/<subdomain>`.
   - Toggle to "Leader Area". Check that all input fields, labels, buttons, and helper texts have high-contrast visibility on both light and dark themes.
   - Switch between Member, Leader, and Branch tabs to verify layout stability without jumpiness.
3. **Leader Registration**:
   - Test registration in the Leader Area on `/c/<subdomain>` with full name, email, password, and access code. Verify that clear feedback is returned and registration succeeds.
4. **Branch Portal**:
   - Click "Branch Portal" on `/c/<subdomain>`.
   - Verify both "Register Branch" (with password field + eye toggle) and "Branch Admin Login" work seamlessly.
5. **Password Visibility**:
   - Check password inputs across `/auth`, `/onboarding`, `/c/<subdomain>`, and `/super-admin`. Verify clicking the eye icon toggles password visibility.
6. **New Church Signup Alert**:
   - Complete a test signup in onboarding and verify that `primehaven26@gmail.com` receives the alert payload.
7. **Feature Lock Universal Messaging**:
   - Log into a free tier account and visit locked sections (e.g. `/branches`, `/messaging`). Verify the message says "Upgrade your account to have access to this feature" without tier-specific labeling.
8. **Super Admin Grouped Features**:
   - Visit `/platform` -> Features. Verify that all features are organized into grouped suites with real-time toggle switches for each tier.
