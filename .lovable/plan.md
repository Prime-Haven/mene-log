# Billing and Prime Haven console expansion

## Goal
Bring church Billing in line with the homepage plan presentation, and turn the Prime Haven console into a richer operations dashboard while preserving the rule that operators cannot browse individual church records.

## 1. Church billing page
- Rebuild Billing around the homepage’s four plan cards, monthly/yearly switch, highlighted Pro plan, included/unavailable feature lists, local currency display, and matching black, light-blue, and white visual treatment.
- Keep the signed-in context above the plans: current plan, trial or renewal date, payment method, usage against limits, purchased member space, coupon entry, payment history, receipt resend, and renewal/switch actions.
- Make the active plan unmistakable and keep unavailable actions disabled or explained for branches and non-owner roles.
- Share plan-card presentation and plan copy with the homepage so the two views do not drift, while retaining Billing-only actions.

## 2. Prime Haven overview
- Redesign the overview as a dense but readable operations dashboard using the existing Mene:Log tokens: near-black navigation, white surfaces, light-blue emphasis, restrained status colours, and responsive layouts.
- Add summary cards for church status, approval queue, trials, new registrations, plan mix, members, check-ins, active churches, revenue, failed payments, renewals, messaging failures, storage, and system alerts.
- Add trend panels for registrations, active churches, check-ins, revenue, plan mix, and trial conversion where the underlying data supports it.
- Add “Needs attention” panels for flagged approvals, trials ending soon, failed payments, stalled messages, inactive churches, and storage-heavy churches.

## 3. Church registry and church detail
- Replace the plain row list and narrow detail sheet with a more scannable registry and a fuller account workspace.
- Add compact status, plan, approval, activity, usage, storage, renewal, and branch indicators to each church row.
- Organize church detail into Overview, Subscription, Usage, Branches, Messaging, Backups, Notes, and Activity sections.
- Preserve all current actions: edit, plan change, suspend/restore/close, extend time, extra space, welcome email, two-step requirement, notes, branch handling, and payment history.
- Add clear confirmations, progress states, error messages, and audit entries for every mutation.

## 4. Flagged-account approval
- Normal verified registrations open immediately; only flagged registrations enter Prime Haven approval.
- Flag a registration when automated checks find an incomplete contact identity, blocked/disposable email domain, duplicate or suspicious account details, repeated signup attempts, payment inconsistency, or a manual operator flag.
- Show the exact reasons, submitted account details, selected plan, signup time, and risk indicators in the approval queue—never member records.
- Operators can approve, reject with a required reason, or request correction. The church sees a clear account-status message and cannot use restricted actions while review is pending.
- Existing branch-request approval remains owned by the head church and is shown separately from platform risk approval.

## 5. Revenue and billing analytics
- Add cards for gross revenue, 30-day and 12-month revenue, successful/failed/pending payments, average successful payment, recurring-plan mix, extra-space sales, upcoming renewals, and estimated at-risk revenue.
- Add monthly revenue trend, successful versus failed payments, revenue by plan, monthly versus yearly billing mix, payment channel/currency mix, and recent payment activity.
- Add date, plan, status, interval, currency, and church filters plus CSV export that respects the filters.
- Use recorded transaction currencies accurately; do not silently combine non-USD amounts into USD totals without a stored conversion basis.

## 6. Growth and usage analytics
- Add cards for new churches, active churches, trial churches, activation rate, member growth, check-in growth, average usage per church, and inactive accounts.
- Add charts for church registrations, plan distribution, weekly check-ins, member growth, service activity, and active/inactive church trends.
- Keep most/least active rankings, add plan and time filters, and show only tenant-level counts.

## 7. Database, storage, backup, and restore
- Expand capacity reporting with estimated database use, file use, row totals by category, largest churches, bucket use, recent growth, and warning thresholds.
- Add one-church-at-a-time encrypted backups containing that church’s records and files. Operators can create and download an encrypted archive but cannot inspect its private contents in the console.
- Keep archives in private storage with expiry, checksum, size, creator, status, and audit history. Exclude platform operators, credentials, secrets, and unrelated churches.
- Restore only into the same church. Require two-step operator authentication, a typed church-name confirmation, integrity/schema checks, a preview of record counts, and an automatic pre-restore recovery backup.
- Run restore as a tracked job with pending/running/completed/failed states; block concurrent backup/restore for that church and record every step in the platform audit log.

## 8. Messaging health
- Add sent, delivered where available, queued, retrying, failed, and stale counts; email/SMS split; success rate; 24-hour and 30-day trends; failures by safe error category; queue age; and busiest churches by counts.
- Add channel, status, church, and date filters; retry one church or all eligible failures with confirmation and rate limiting.
- Never expose recipients, message bodies, subjects, or individual member identities.

## 9. Feature activation and backend correctness
- Make the Features screen the authoritative live plan matrix and display whether each switch/limit matches the built-in defaults.
- Verify every menu item, page guard, server action, and database operation against the same live plan configuration so activating a feature makes it usable for the intended tier—not merely visible.
- Add server-side entitlement checks to sensitive actions; client-side locks remain explanatory UI, not security.
- Test Free, Standard, Pro, and Premium accounts for allowed, newly activated, and denied features, including direct calls that attempt to bypass the interface.

## Technical details
- Extend the operator snapshot with bounded aggregate time series and status summaries; do not return member-level rows to the console.
- Add database fields/functions for risk flags and approval reasons, plus private backup jobs/artifacts with explicit grants, row-level security, operator checks, two-step checks, rate limits, and audit events.
- Use server functions for backup/restore orchestration and Web Crypto-compatible authenticated encryption. Store the encryption key as a managed secret, never in code or the database.
- Generate versioned tenant-scoped archives and validate archive tenant ID, schema version, checksum, and allowed tables before restore.
- Extract shared pricing-card data/presentation without changing the public homepage’s current behavior.

## Validation
- Test Billing at mobile and desktop sizes for every tier, billing interval, currency mode, branch state, and owner/non-owner permissions.
- Test flagged and unflagged signup paths, approve/reject/correction flows, and confirm pending accounts are restricted correctly.
- Test every operator mutation and all dashboard filters/exports with real database results and audit-log confirmation.
- Create, download, decrypt internally, validate, and restore a disposable test church backup; verify another church cannot be affected and private contents never render in the console.
- Test feature switches end to end in all four tier accounts, including server-side denial when disabled.
- Verify charts, empty/loading/error states, phone layouts, desktop layouts, and the latest build/runtime logs before completion.
