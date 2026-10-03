# Mene:Log Comprehensive System Upgrades & Database Inconsistency Audit

Comprehensive architecture and database audit plan for Mene:Log to deliver robust system upgrades across core church operations, Super Admin controls, reporting/exports, and security, paired with an executable SQL migration and Drizzle schema synchronization to eliminate schema drift and data inconsistencies.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following confirmed decisions incorporate your answers from Phase 1. Review the proposed migration strategy and execution stages before proceeding.

- **Confirmed Scope**: Upgrades across all 4 operational pillars: (1) Core church operations, check-in, & member care, (2) Super admin controls & tenant management, (3) Data synchronization & export reporting, and (4) Security, rate limiting, & RBAC.
- **Confirmed Integrity Scope**: Comprehensive audit across schemas, enums, foreign keys, member codes, attendance duplication, and multi-tenant isolation.
- **Confirmed Delivery Format**: Single idempotent, executable SQL migration script (`database-remediation-and-upgrades.sql`) accompanied by synchronized Drizzle schema definitions (`drizzle/schema.ts`) and safe runtime fallbacks.
- **Critical Migration Safety Gate**: All database enum additions (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`) and column additions use transactional guards (`DO $$ BEGIN ... EXCEPTION WHEN ... END $$;`) to guarantee zero downtime and zero data loss on live Supabase instances.

---

## 1. Overview & Core Concept

- **What It Does**: Hardens Mene:Log's full-stack architecture by eliminating schema discrepancies between Postgres migrations, Drizzle ORM, and Supabase client types. Delivers unified attendance tracking (merging physical QR and online streaming watch sessions), automated member code reconciliation, robust CSV export security, and high-precision Super Admin health monitors.
- **Target Audience / Persona**:
  - *Pastors & Church Administrators*: Real-time service dashboards, clean attendance registers without duplicate or stuck records, and effortless CSV exports.
  - *Members & First-Timers*: Instant door scans and web-based livestream check-ins that reliably log attendance after minimum watch thresholds.
  - *Prime Haven Super Admins & Support Operators*: Consolidated platform audit telemetry, dedicated support console queue, and tenant data integrity metrics.
- **Key Value**: Guarantees database-level referential integrity and eliminates silent runtime failures caused by missing enums, orphaned records, or divergent column names.

---

## 2. User Experience & Visual Design

Following the *SaaS & Dashboard Design Guidelines* (`frontend-design` constitution):

### Key User Flows
1. **Unified Attendance & Live Verification**: Church administrators view Sunday and midweek attendance with clear badges distinguishing physical door scans, self-check-ins, and online livestream attendances. Any manual override or duplicate check-in is flagged non-destructively.
2. **Member Profile & Code Health**: Member list displays unique `ML-XXXXX` codes with inline validation indicators. Admin has a 1-click "Generate Missing Codes" tool for imported rosters.
3. **Super Admin Platform Health & Inconsistency Scanner**: The Super Admin `/platform` console features an automated "Database Health" diagnostic tile summarizing orphaned records, unindexed services, and pending migration checks.

### Visual Identity & Theme
- **Aesthetic Direction**: Utilitarian, calm, high-density SaaS dashboard. Flat single-elevation surfaces with hairline borders (`border-border/60`), zero unnecessary nested card containers, and clean visual rhythm.
- **Color Palette & Mood**: Deep contrast background (`--color-deep`: `#050a18`, `--color-background`: `#fafbfc`), confident church primary blue (`--color-primary`: `#3b82f6`), and semantic muted accents (`oklch` tokens).
- **Typography & Tabular Numerals**: Display headings in *Sora* (`font-display`), UI copy in *Manrope* (`font-sans`), and all numeric identifiers, counts, timestamps, and member codes strictly in `font-mono` with `tabular-nums` to eliminate layout jitter.
- **Zero-Pill Discipline**: Static metadata (attendance counts, dates, statuses) rendered as clean unboxed text separated by typographic middots (`·`) rather than heavy rounded pill enclosures.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual Attendance Model (Physical Scans + Online Streams)**
  - *Chosen Approach*: Maintain `watch_sessions` for continuous second-by-second livestream pings, but automatically insert a verified record into `attendance` with `method = 'online'` once watch duration reaches `online_min_minutes`.
  - *Why*: Allows church reporting, export tools, and member attendance history to query one single canonical table (`attendance`) while preserving telemetry granularity in `watch_sessions`.
  - *Alternatives Considered*: Querying both `attendance` and `watch_sessions` on every dashboard view (rejected due to query complexity and slow load times on large congregations).

- **Decision 2: Member Code Uniqueness & Reconciliation**
  - *Chosen Approach*: Add an index on `(tenant_id, upper(member_code))` with an automated reconciliation function (`repair_tenant_member_codes(tenant_uuid)`) that safely assigns `ML-XXXXX` format codes to legacy or imported members lacking them.
  - *Why*: Ensures rapid door scans, offline manual check-ins, and fallback lookups never collide or fail due to formatting differences.

- **Decision 3: Drizzle ORM Schema Synchronization**
  - *Chosen Approach*: Update `drizzle/schema.ts` to mirror all live Supabase tables (`watch_sessions`, `plan_config`, `tenant_backup_jobs`, `platform_system_state`, `import_batches`, `audit_events`, `profiles`), add missing enum values (`'online'`), and add missing tenant columns (`extra_member_slots`, `require_mfa`, `parent_tenant_id`).
  - *Why*: Prevents Drizzle migration drifts and ensures automated schema validation tools and backend services have 100% type parity with PostgreSQL.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Client Applications                           │
├──────────────────────────┬─────────────────────────────┬───────────────┤
│    Church Admin App      │   Member Self-Check-in      │  Super Admin  │
│  (/_app/attendance,      │   & Live Stream Watcher     │   Platform    │
│   /_app/members, etc.)   │   (/c/$sub, /live/$sub)     │  (/platform)  │
└────────────┬─────────────┴──────────────┬──────────────┴───────┬───────┘
             │                            │                      │
             ▼                            ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Server Functions & Middleware                     │
│   - watch.functions.ts (heartbeat verification & attendance recording)  │
│   - operator.functions.ts (platform audits & tenant maintenance)       │
│   - checkin.functions.ts (resilient member resolution)                 │
│   - csv.ts (formula injection neutralization)                          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL (Supabase)                          │
├────────────────────────────────────────────────────────────────────────┤
│  Canonical Tables:                                                     │
│  - tenants (with parent_tenant_id, extra_member_slots, require_mfa)    │
│  - members (with member_code index, import_batch_id)                   │
│  - services (with stream_url, online_min_minutes, theme, is_default)   │
│  - attendance (enum: scan, self_checkin, manual, corrected, online)    │
│  - watch_sessions (second tracking & heartbeat last_ping)              │
│  - plan_config, tenant_backup_jobs, platform_system_state              │
│                                                                        │
│  Integrity Constraints:                                                │
│  - attendance_service_member_idx: UNIQUE (service_id, member_id)       │
│  - rate_limit_cleanup_job(): Auto-purge expired rate limit buckets     │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Inconsistencies Identified & Resolution Matrix

| Area | Current Inconsistency / Drift | Resolution |
| :--- | :--- | :--- |
| **Enum Discrepancy** | `attendance_method` in `drizzle/schema.ts` lacks `'online'`, causing Drizzle type drift and potential ORM validation errors. | Add `'online'` to `attendanceMethodEnum` in Drizzle and ensure Postgres enum has `'online'` via idempotent migration. |
| **Missing Drizzle Tables** | `watch_sessions`, `plan_config`, `tenant_backup_jobs`, `platform_system_state`, `import_batches`, `audit_events`, and `profiles` are defined in SQL but missing in `drizzle/schema.ts`. | Add complete Drizzle table definitions and relations in `drizzle/schema.ts`. |
| **Missing Tenant Columns** | `extra_member_slots`, `require_mfa`, `parent_tenant_id` are in SQL migrations but omitted from `drizzle/schema.ts`. | Add missing columns with proper types and defaults in `drizzle/schema.ts`. |
| **Attendance Conflict Specs** | Some older Supabase setups lacked the unconstrained `UNIQUE(service_id, member_id)` index, causing `ON CONFLICT` errors during rapid check-ins. | Include idempotent `CREATE UNIQUE INDEX IF NOT EXISTS attendance_service_member_idx ON public.attendance (service_id, member_id);` in migration. |
| **Member Code Collisions** | Imported or manually created members can have null or case-discrepant `member_code` values (`ml-102` vs `ML-102`). | Provide `reconcile_member_codes()` SQL procedure to normalize existing codes to uppercase and backfill null codes safely. |
| **Rate Limit Bloat** | `public.rate_limit_hits` grows monotonically without automatic index pruning. | Add index on `rate_limit_hits(expires_at)` and a scheduled cleanup routine (`purge_expired_rate_limits()`). |

### Key Sequences & Execution Stages

1. **Stage 1: Drizzle Schema Synchronization**
   - Update `drizzle/schema.ts` to export all missing tables, enums (`online`), and tenant/member columns.
   - Run linter and typecheck to verify zero regressions.
2. **Stage 2: Master SQL Remediation Script**
   - Create `database-remediation-and-upgrades.sql` containing idempotent `DO $$ ... $$` blocks for enums, columns, foreign keys with `ON DELETE CASCADE/SET NULL`, unique check-in indexes, and the member code repair procedure.
3. **Stage 3: Application Resilience & Upgrades**
   - Enhance `src/lib/watch.functions.ts` to gracefully fallback if `online` enum is not yet applied.
   - Verify CSV export formatting across all reporting surfaces with `csvCell` formula escaping.
   - Add database diagnostic overview RPC to the Super Admin platform view (`/platform`) so operators can verify table counts, orphaned records, and schema health in real time.
4. **Stage 4: Verification & Build Check**
   - Execute `lint_applet` and `compile_applet` to confirm pristine build and deployment readiness.
