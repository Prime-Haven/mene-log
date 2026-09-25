# Mene:Log: standalone database, feature switches, and the full Premium package

## 1. Standalone database
- Check every table, function, rule and storage bucket against the app. Rebuild anything missing so this project stands alone.
- Search the code and settings once more for anything that still points at the old project, and remove it.
- Make sure all four plans (Free, Standard, Pro, Premium) exist as real plans in the database. Anyone can sign up for Free.
- When a trial ends without payment, the church drops to **Free forever** and keeps its records. Anything above Free is locked, not deleted.

## 2. Features screen in the superadmin console
- Add a new **Features** section with a grid. Each row is a feature, each column is a plan, and each box is an on/off switch.
- The same grid also holds the limits for each plan: staff seats, member limit and daily messages.
- The switches control the whole system. Church dashboards, the database rules and the server all read from them, so a feature that is switched off really is blocked, not just hidden.
- When a feature is off for a church's plan, it shows with a padlock in that church's menu. Clicking it opens "Upgrade to unlock" with the cheapest plan that includes it.
- The only way a church gets a locked feature is by paying for a plan that has it switched on.
- Every change to a switch goes into the audit log.
- Starting values match today's plans, with the new Premium features added.

## 3. Premium features

**a. Ask Mene:Log AI (Gemini)**
- Premium churches get the full chat: longer conversations, higher daily limits, and deeper answers about attendance, growth, follow-ups and trends.
- Lower plans get a lighter version or none at all, depending on your switches.

**b. WhatsApp messaging**
- Send WhatsApp messages and broadcasts to members and registered leaders, using the same audiences as email and SMS.
- Automatic messages (welcome, birthday and absence) can also go by WhatsApp.
- Members can opt out.
- This goes through the WhatsApp Business service, which needs your account details.

**c. SMS**
- SMS moves to Twilio and is sent to each member's phone number. It uses the same queue, daily limits and quiet hours as other messages.

**d. Watch Live, with online attendance**
- The church's private link gets a **Watch Live** button.
- The member enters their member code, the same code that sits behind their QR code. The system checks the code before the stream opens.
- The church admin sets the live stream link for each service, for example YouTube Live or Facebook Live.
- While a member watches, the page records how long they have been watching. Their minutes watched show on the attendance page.
- Members who watch for longer than a minimum time the church sets are counted as present, marked as "Online".

**e. Branch churches**
- The private link of a Premium church gets a **Register as a branch** form.
- The head office approves each branch.
- A branch gets its own admin account and dashboard. It works like a Pro account and follows whatever you switch on for Pro. Everything else shows with a padlock.
- The head office sees every branch and combined figures.

**f. Leader hierarchy**
- On the Structure page, the church sets up its leadership levels in order, for example Cell Leader, then Zone Leader, then Pastor.
- When leaders register, they pick their level and the leader above them.
- Each leader's dashboard shows only what a leader needs: their own people, follow-ups, attendance for their group, their QR code, and the leaders under them.

## 4. What I need from you
- **WhatsApp:** your WhatsApp Business account details, or a Twilio number set up for WhatsApp.
- **Twilio:** your Account SID, Auth Token and sender number. I'll ask for these through a secure form.
- **Database changes:** my database tool can't apply new changes in this project. I'll write one complete update file, and you run it in the SQL editor, the same way you ran the Free plan update.

## Technical details
- **Plan features table:** new `plan_features` table (tier, feature_key, enabled) and `plan_limits` table.
  - `tier_entitlements()` is rewritten to read these tables. `has_feature(tenant, key)` is used in RPCs and rules.
  - `src/lib/entitlements.ts` becomes a loader that reads the tables, with the current constants as a fallback.
  - Only platform admins can write to them, through `platform_set_feature` (audited).
- **Trial ending:** the daily job and a check at sign-in move churches whose trial has expired to `free`. Their extra features switch off by plan and their data stays.
- **WhatsApp and SMS:**
  - Add `whatsapp` as a message channel. The providers live in `messaging.server.ts`: Twilio for SMS, and Twilio WhatsApp or the Meta Cloud API for WhatsApp.
  - `queue_broadcast` and the automatic messages accept the new channel.
  - Add a `members.whatsapp_opt_out` column.
- **Watch Live:**
  - Add `services.stream_url` and `services.online_min_minutes` columns.
  - New `watch_sessions` table (service, member, started_at, last_ping, seconds).
  - Public server routes handle entering the code (rate-limited and checked against the hashed code, returning a short-lived session) and a heartbeat every 30s. When the minimum time is reached, attendance is recorded with a new `online` method.
- **Branches:**
  - New `tenants.parent_tenant_id` column.
  - Branch tenants get the effective tier `standard` (Pro) and are approved by the parent's admins.
  - Parent admins get read-only combined figures through a security-definer RPC.
- **Hierarchy:**
  - Reuse `structure_levels` and `positions`.
  - Leader sign-up picks a level and a parent leader, stored as `leader_profiles.level_id` and `parent_leader_id`.
  - `leader_scope_member_ids` extends to cover the leaders below.
- **Gemini tiers:** `ask_mene_allow_request` reads the limits for each plan, and the Premium context adds branch and hierarchy totals.
- **Update file:** all schema changes go into one `premium-upgrade.sql`, with grants and row-level rules on every new table.
