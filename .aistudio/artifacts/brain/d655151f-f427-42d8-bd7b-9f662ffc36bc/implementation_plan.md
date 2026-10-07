# 30-Day Trial, Post-Trial Paywall & Downgrade, and Onboarding Admin Alerts

Implement the exact changes requested in the voice note: extend the trial period from 14 to 30 days, guide expired trials to payment or downgrade with strict Pro feature locking, and deliver instant SMS and Email notifications upon church onboarding completion.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following confirmed decisions guide this execution:
> - **30-Day Trial Everywhere**: Database provisioning (`provision_tenant`), schema defaults, UI countdowns, and warning crons will uniformly use a **30-day trial** (increased from 14 days).
> - **Post-Trial Paywall & Guided Downgrade**: 
>   - When a 30-day trial concludes without payment, churches will be presented with a clear banner guiding them to activate/pay for their tier or smoothly downgrade to the **Free plan**.
>   - Adding an active "Downgrade to Free" action in `Billing & Plans` so churches can self-service switch to Free at any time.
>   - Feature locking (`src/lib/entitlements.ts` & `FeatureGate.tsx`) guarantees Pro/Standard features remain locked when on Free, while all member directories, attendances, and data remain preserved.
> - **Onboarding Admin Notifications**:
>   - **SMS Alert**: Immediately dispatched via Arkesel to `0550160237` (formatted as `+233550160237` with sender ID `"Mene Log"`).
>   - **Email Alert**: Sent to `mene.log26@gmail.com` via Resend with church details, admin name, package, and direct Super Admin review link.

---

## 1. Overview & Core Concept

- **What It Delivers**: 
  1. A generous 30-day full-feature trial giving churches ample time through multiple Sunday services.
  2. A seamless end-of-trial transition: pay for their chosen tier (via Paystack card or Mobile Money) or downgrade to Free with graceful feature tier restrictions.
  3. Real-time operator awareness via instant SMS to `0550160237` and email to `mene.log26@gmail.com` the moment any new church completes onboarding.

---

## 2. User Experience & Flows

### A. Church Onboarding & Alerts Flow
```
┌──────────────────────────┐       ┌────────────────────────────────────────────────────────┐
│ Church Finishes Register │ ────> │  1. Database creates church with 30-day trial         │
│ & Email Verification     │       │  2. SMS dispatched to 0550160237                       │
│                          │       │  3. Email dispatched to mene.log26@gmail.com           │
└──────────────────────────┘       └────────────────────────────────────────────────────────┘
```
- **Admin SMS Format**:  
  `"[Mene:Log] New church onboarded: Grace Baptist (subdomain: grace) on 30-day PRO trial. Admin: Pastor Kwame (0244123456). Review at menelog.site/super-admin"`
- **Admin Email Format**:  
  Branded HTML email to `mene.log26@gmail.com` detailing Church Name, Subdomain, Contact Email, Contact Phone, Selected Plan, and One-Click Super Admin Link.

### B. 30-Day Trial & Post-Trial Experience
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Active 30-Day Trial (Days 1–30)                                                          │
│ Banner: "Your 30-day trial is currently active. 18 days remaining until Sunday, Nov 2"   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Trial Expired (Day 31+)                                                                  │
│ Warning Banner: "Your 30-day trial has concluded. Activate your plan or switch to Free." │
│ [Renew / Pay for Pro]                [Downgrade to Free Forever]                         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- When on **Free** (after downgrade):
  - Pro features (e.g., Automated SMS/WhatsApp, Multi-branch management, Advanced leader rank hierarchies, Space add-ons) show the friendly upgrade modal (`FeatureGate`).
  - Essential core check-in, attendance recording, and member directory remain fully functional forever.

---

## 3. Technical Implementation Steps

### Step 1: Database & Server Trial Duration (30 Days)
- Update SQL tenant provisioning definition (`provision_tenant` / `reserve_tenant_and_start_trial`):
  - Set `trial_ends_at = now() + interval '30 days'`
  - Set `period_end = v_start + 30`
  - Set audit payload `trial_days: 30`
- Update `src/routes/onboarding.tsx` and `src/routes/onboarding-complete.tsx` to verify the 30-day trial creation.

### Step 2: Onboarding SMS & Email Dispatch
- In `src/lib/support.server.ts`:
  - Update `sendNewChurchSignupAlert`:
    - Add SMS dispatch to `+233550160237` using `sendSms` with sender `"Mene Log"`.
    - Set primary email alert recipient to `mene.log26@gmail.com` (and copy `primehaven26@gmail.com`).
  - Ensure both direct signup and email-verification onboarding completion trigger these alerts.

### Step 3: Billing Downgrade to Free & Feature Locking
- In `src/lib/billing.functions.ts`:
  - Add `downgradeToFree` server function:
    - Verifies church admin/owner authorization.
    - Updates `tenants.tier = 'free'` and `subscriptions.tier = 'free'` with `period_end = '9999-12-31'`.
    - Logs audit event `billing.downgraded_to_free`.
- In `src/routes/_app/billing.tsx`:
  - Enable the "Select Free" / "Downgrade to Free" button with confirmation dialog.
  - When trial is expired (`!trialActive && tenant.tier !== 'free' && !hasPaidSubscription`), display an alert card guiding payment or downgrade.
- In `src/lib/entitlements.ts` & `src/components/FeatureGate.tsx`:
  - Verify all Pro features are locked when tier is `free`, displaying the upgrade prompt to reactivate Pro.

---

## 4. Verification & Testing

1. **Lint & Build**: Run `lint_applet` and `compile_applet`.
2. **Onboarding Simulation**: Complete onboarding and test that `sendNewChurchSignupAlert` executes with SMS payload to `0550160237` and email payload to `mene.log26@gmail.com`.
3. **Billing & Downgrade**: Verify that a church can switch to Free, that the Pro features gate properly, and that records remain intact.
