# Branches, check-in pages by plan, a fuller Prime Haven console, and a mobile app feel

## 1. Premium branches
- **Create a branch:** the Premium head office clicks "Add branch" in its dashboard. There will also be a "Register as a branch" link on its check-in page, and head office approves those.
- **The branch's own address:** each branch gets its own check-in address, e.g. `menelog.site/c/grace-accra-east`. Its page shows "A branch of Grace Chapel", linking back to the main church's page. The main church's page lists its branches.
- **Branch dashboard:** it works like a Pro account. Branches get Pro features, including the leader structure, leader sign-up and leader dashboards, all scoped to the branch. Anything outside Pro shows a padlock.
- **Head office view:** a "Branches" page with each branch's members, attendance, leaders and last activity, a combined total, and the option to suspend or remove a branch.
- **Prime Haven console:** each church's panel shows its parent or its branches, and the Churches list gets a "branches" filter. You still see counts only, never member details.

## 2. Check-in pages by plan
Every check-in page uses the homepage look: the worship video background, glass panels and the church name in large bold text above the form.

| Plan | Check-in page | Dashboard |
|---|---|---|
| Free | Self check-in | QR scanning during the 14-day trial, then attendance is ticked by hand only |
| Standard | Self check-in | Adds QR scanning |
| Pro | Check-in, leader sign-up and sign-in | Leader accounts and structure; Watch Live if you switch it on in Features |
| Premium | Check-in, leader sign-up, Watch Live, branch registration | Everything |

Each of these follows your Features switches. If you switch Watch Live on for Pro, Pro churches get the Watch Live button on their check-in page.

## 3. Fuller Prime Haven console
The My Account page becomes a full **Settings** area:
- **Profile and security:** your name, email and photo, password, two-step code reset, active sessions with sign-out everywhere, and the sign-in history.
- **Platform branding:** platform name, logo, main colours, homepage headline and verse text, and support email and phone.
- **Pricing:** monthly USD price for each plan, the yearly discount for each plan, trial length and the extra member space price. These feed the homepage, sign-up and Billing.
- **Sign-ups:** approval on or off, blocked email domains, and a maintenance mode with a message.
- **Emails:** sender name and address, reply-to address, footer text, and a "send test email" button.
- **Messaging limits:** quiet hours, daily caps, and the absence alert threshold used by default.
- **Legal:** edit the Terms and Privacy text.
- **Homepage content:** manage reviews, the stats on or off, and a banner announcement.
- **Data:** export all church summaries and all payments.

Other new console features:
- A global search.
- A notifications bell for new sign-ups, failed payments and trials ending.
- Coupon and discount codes.
- A per-church "impersonate view" of the plan's features only, with no member data.
- A health check that actually tests Resend, Paystack and the AI assistant and shows the result.

## 4. Suggestions (built in this pass unless you say no)
- Fix the known attendance-ticking error.
- Show the member code under the QR on the Members page, so admins can share it for Watch Live.
- Schedule the daily job for birthdays, absences and trial endings. This is part of the SQL file you'll run.
- Ask members for consent before the first WhatsApp or SMS message.
- Add clear empty states and loading placeholders everywhere.
- Add error pages that offer "Try again".

## 5. Mobile app feel and install
- **On phones:**
  - a bottom tab bar with the four main sections plus "More", and a compact top bar with the page title
  - full-width cards, large touch targets, a slide-up menu, and swipe-friendly lists
  - the homepage gets an app-style header and bottom actions
- **Install:**
  - Android shows "Install Mene:Log"
  - iPhone shows a one-time tip: Share, then "Add to Home Screen"
  - it opens full-screen with the Mene:Log icon and colours
- **Offline:** not included. The installed app opens and works online, so there are no stale-page risks.

## Order of work
1. You run one SQL file. It covers the branch links, platform settings, coupons, the attendance fix and the daily schedule.
2. Branches.
3. Check-in pages by plan.
4. Console settings and features.
5. Suggestions.
6. Mobile and install.
7. A browser test of each plan's check-in page, the branch flow, the console settings and the phone layout.

## Technical details
- **SQL, which you run:**
  - `tenants.parent_tenant_id` already exists. Add `branch_requests`, a `platform_settings` key/value jsonb table (operator-write, public-read for safe keys), `coupons`, and `operator_sessions` if needed.
  - Fix the attendance upsert (`ON CONFLICT (service_id, member_id) WHERE member_id IS NOT NULL`).
  - Add a pg_cron job calling `/api/public/cron/messaging` with the `MENELOG_CRON_SECRET` header.
- **Branch tier:** for branches the tier resolves to `standard` (Pro) in `useTenant`, and server functions use `requireSupabaseAuth` plus a head-office check. The head-office rollup is an aggregate-only RPC.
- **Check-in gates:** the gates on `c.$subdomain.tsx` read the plan config (`leaders`, `watch_live`, `branches`, `qr`). The Free QR check uses `trial_ends_at`.
- **Pricing:** `pricing.ts` reads from `platform_settings`, with the current values as the fallback.
- **Install:** manifest-only, meaning `public/manifest.webmanifest`, icons and head tags in `__root.tsx`. There is no service worker.
- **Mobile navigation:** a `MobileTabBar` in `_app/route.tsx` and `platform.tsx`, shown below `md`.
