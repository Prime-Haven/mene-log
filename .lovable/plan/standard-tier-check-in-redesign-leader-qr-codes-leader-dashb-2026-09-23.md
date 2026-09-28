# Standard tier: check-in redesign, leader QR codes, leader dashboard

## Transcript summary (voice note)

All changes below apply to Standard-tier churches (Premium inherits them, Basic is unchanged).

1. Redesign the church check-in page to match the homepage hero: dark overlay on a photo, blue accent, white text. Church name large and bold at the top, church logo prominent.
2. "Who invited you?" becomes a dropdown. The default is "Self / walk-in", followed by every registered leader of that church.
3. When the member taps Check in, their QR code is generated and downloads automatically.
4. Every member QR code is kept in the church account. The Members page shows a QR icon per member so staff can view and download it.
5. Leaders who register get their own leader QR code. When a leader's code is scanned, it is recorded as leader attendance. Leaders still count as members.
6. Leaders only see members who chose them or were assigned to them, and never another leader's people.
7. Leader dashboard: their members, first-timers who attended, demographics, absentee tracking with follow-up notes, plus a few extra useful tools.

## What gets built

### 1. Check-in page redesign

- Full-screen hero background (the homepage worship image, or the church's own background if uploaded), dark overlay, subtle moving blur, blue accent.
- Header: large church logo plus the church name in bold display type. The Mene:Log mark becomes small in the footer.
- The Member and Leader tabs and the forms get the same dark glass style as onboarding.

### 2. "Who invited you?" dropdown

- Options: "Self / walk-in" (default) followed by each active leader's name and leader type.
- The free-text "other" box is removed. Basic churches only see "Self / walk-in".
- The server checks that the chosen leader belongs to this church.

### 3. Automatic QR download

- The QR code downloads as a PNG straight after check-in. It is labelled with the church name and member name.
- On iPhone, a full-screen image appears with the instruction "press and hold, then Save to Photos".

### 4. QR codes kept in the church account

- Right now codes are stored only in scrambled form for security, so the original can't be shown again. The change stores each code encrypted on the server, so staff can reopen the same code instead of creating a new one.
- On the Members page, every row gets a QR icon. It opens the code with Download and Share buttons.
- A "Download all QR codes (ZIP)" button is added for owners and admins. It is rate-limited and recorded in the activity log.
- Existing members get a new code the first time someone opens it, since their old code can't be recovered.

### 5. Leader QR codes and leader attendance

- Each approved leader is linked to a member record, created automatically if needed. They get a QR code marked as a leader code, which they can download from their dashboard.
- Scanning a leader code records attendance with the "leader" designation. Reports show members and leaders separately, and leaders are still counted in the total.

### 6. Strict leader privacy

- A leader's people are members who chose them at check-in, plus members an admin assigned to them.
- This is enforced by the database's access rules, not just by what the screen shows. A leader can never read another leader's members, contact details or attendance.

### 7. Leader dashboard (My members)

- Summary cards: total members, first-timers this month, present last Sunday, absent for N+ Sundays.
- My members: a searchable list with phone and email (tap to call or WhatsApp) and the last date attended.
- First-timers: who came, when, and their follow-up status.
- Demographics: charts for gender, age bands, marital status, location and occupation. These cover only the leader's own people.
- Absentees: members who missed the last N Sundays. The leader can log a contact outcome (called, visited, unreachable, note), and the admin sees it in Follow-ups.
- Extras: an upcoming birthdays list, the leader's own attendance streak, and "My QR code".

## Technical details

- Migration:
  - Add `members.is_leader` / `leader_profiles.member_id`.
  - Add `qr_tokens.kind` ('member' | 'leader') and `qr_tokens.token_encrypted`. The token is encrypted with a server secret (`QR_TOKEN_KEY`, generated) and the hash is kept for lookup.
  - Add `attendance.designation`.
  - Add `member_leader_assignments` with GRANTs and RLS.
  - Add `leader_contact_logs`.
- New or updated RPCs:
  - `public_leaders(subdomain)`, which returns only names and types
  - A validated check-in with `invited_by_leader_id` null meaning self
  - `leader_scope_member_ids()`, a security-definer helper used in RLS
  - `leader_dashboard_stats()`, `leader_demographics()`, `leader_absentees(n)`
  - `get_member_qr(member)`, admin-only, with an audit log entry
- The server functions that decrypt codes and build the ZIP use `requireSupabaseAuth`. Rate limiting uses `check_rate_limit`.
- Entitlements: the invite dropdown with leaders, leader QR codes and the leader dashboard all stay behind the `leaders` feature (Standard+).
- Verification in the browser:
  - Check in a member choosing a leader, and confirm the download
  - Admin views and downloads the QR code
  - A leader registers, gets their code, and the scan records leader attendance
  - A second leader cannot see the first leader's members
  - Desktop and mobile layouts
