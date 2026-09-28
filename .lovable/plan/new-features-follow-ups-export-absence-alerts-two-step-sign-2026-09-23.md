# New features: follow-ups, export, absence alerts, two-step sign-in, attendance register

## 1. Attendance register (all packages)

A new **Attendance** page for church admins: pick a service, see every member with a tick box, and tick or untick people who are present. You can search by name, and "Mark all shown" ticks everyone in the current list at once. Each change saves straight away. It uses the existing manual-attendance record, so reports and dashboards count it. Unticking removes the mark and is recorded in the activity log. Closed services and paused (inactive) accounts are read-only.

## 2. First-timer follow-up list (Standard and Premium)

A **Follow-ups** page listing first-timers with a status: New, Contacted, Visited, Joined, or Not interested. You can:

- assign each person to a leader, add a short note, and set a next-contact date
- see overdue follow-ups highlighted
- move a person to "Joined", which also makes them an active member

Leaders see only the people assigned to them, on their My members page.

## 3. Absence alerts (all packages)

A dashboard card lists members who have missed the last N Sundays. N comes from the church's existing absence setting in Settings (default 3). Each person has a quick "Add to follow-ups" action (Standard and Premium). The list is worked out on the server from attendance totals, without loading every attendance record into the browser.

## 4. Full data export (owner only)

In Settings, **Export church data** downloads a ZIP of CSV files: members, services, attendance, leaders, and follow-ups. The download:

- is limited to 3 per hour
- is recorded in the activity log
- never includes QR codes, passwords, or messaging credentials

## 5. Two-step sign-in

Uses an authenticator app (such as Google Authenticator) through the built-in sign-in system:

- **Settings > Security:** turn it on by scanning a QR code and entering a 6-digit code. You can also turn it off.
- **Sign-in:** people who turned it on are asked for the 6-digit code after their password.
- **Owners:** can choose to require it for all staff in their church.
- **Prime Haven operator console:** always requires it. The first sign-in walks you through setting it up.

## Technical notes

- New table `member_followups` (tenant_id, member_id, status, assigned_leader_id, note, next_contact_on, timestamps). It gets grants, row-level security scoped to church admins, and a limited read for the assigned leader, plus audit logging.
- New backend functions:
  - `attendance_register(service)` and `unmark_attendance(member, service)`
  - `absent_members(tenant)`
  - `upsert_followup(...)`
  - `export_church_data(tenant)`, rate-limited and owner-only, assembled into a ZIP on the server
- Follow-ups are gated in both `entitlements.ts` and `tier_entitlements()`.
- Two-step sign-in uses Supabase MFA with TOTP (enroll, challenge, verify, then check `getAuthenticatorAssuranceLevel`). Operator backend functions will require AAL2 on the server. The church "require 2FA" setting is a new tenant flag that the app layout checks.
- Validate all inputs with zod on both the browser and the server.
- Verify in the browser: tick and untick attendance, follow-up flow, absence card, export download, and 2FA enroll and sign-in.
