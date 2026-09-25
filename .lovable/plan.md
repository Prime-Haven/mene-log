# Prime Haven superadmin: username login and full oversight console

## Sign in
- `/super-admin` asks for **Username** and **Password** instead of email.
- Account: username `master`, password `mene.log26`. It's linked to a hidden operator login account, so there's no email to type.
- The password is stored only as a secure hash, and the username is checked on the server.
- Failed attempts are rate-limited: 5 tries per 15 minutes per username and per network address. Every attempt goes into the audit log.
- The Google Authenticator code step after the password stays in place, because the console already requires two-step sign-in. You scan the QR code once.
- Add a "Change password" option inside the console.

## Console layout
The left menu is grouped like the church dashboards, in Mene:Log colours, with smooth motion.

1. **Overview**: total churches, active, on trial, suspended and closed churches, and new sign-ups this week and month. Also total members and check-ins as platform-wide counts, monthly and yearly revenue, revenue by plan, and trials ending soon.
2. **Churches**: a searchable list with filters for plan, status, approval and country. Each church's page shows plan, status, trial and renewal dates, seats used, members against the plan limit, extra space, **database size** (storage used by that church's records and files), last activity, payment history and contact details. Available actions:
   - create, edit, approve or reject
   - suspend, restore or close
   - change plan
   - extend a trial or subscription
   - grant extra space
   - require two-step sign-in
   - resend the welcome email
   - add private admin notes
3. **Revenue and billing**: all payments with status, filters and CSV export. Also failed payments, upcoming renewals, extra space purchases and a revenue chart by month.
4. **Growth and usage**: a sign-ups chart, plan mix, check-ins per week across the platform, and the most and least active churches (by counts only).
5. **Database and storage**: total database size, size per church ranked from largest, table row totals across the platform, and storage bucket usage.
6. **Messaging health**: emails and SMS sent, failed and queued per church (counts only, never message content), plus a retry button for failed messages.
7. **Reviews**: approve or reject reviews, and pick which ones appear on the homepage.
8. **Announcements**: send a branded email to all church owners or to a filtered group, such as by plan, and keep a history.
9. **Operators**: add or remove other Prime Haven operators, reset their passwords, and see their last sign-in.
10. **Audit log**: every operator action and sign-in, searchable and exportable.
11. **System health**: status of the email service, payment webhook, daily job and AI assistant, with recent error counts.

## Privacy boundary (unchanged)
Operators never see individual members, their contacts, attendance rows, message bodies, QR codes or a church's own audit trail. They get only counts, sizes and account-level information.

## Technical details
- Reuse `super_admin_credentials` (username plus bcrypt hash through pgcrypto) and link it to a synthetic auth user `master@ops.menelog.site`, which is added to `platform_admins`.
- A server function `operatorSignIn({username,password})` checks the rate limit, verifies with `crypt()`, and then signs in the linked auth user on the server. It returns the session tokens, and the client runs `setSession`. After that comes the MFA challenge or enrolment.
- New security-definer RPCs, each checking `is_platform_admin()` plus aal2:
  - `platform_tenant_detail`
  - `platform_db_sizes` (uses `pg_total_relation_size` plus per-tenant row estimates, with the byte size per tenant estimated from row counts × average row width, plus storage object sizes)
  - `platform_revenue`
  - `platform_growth`
  - `platform_messaging_health`
  - `platform_extend_subscription`
  - `platform_set_notes`
  - `platform_operators_*`
  - `platform_announce`, which uses the existing queue
- All mutations are rate-limited and write to `platform_audit_events`. Execute rights are revoked from public and anon.
- Schema changes go in as raw SQL: credentials seed, `platform_announcements` table with grants and RLS, and the RPCs.
- The console is split into routes under `/platform/*` with a shared sidebar layout.
