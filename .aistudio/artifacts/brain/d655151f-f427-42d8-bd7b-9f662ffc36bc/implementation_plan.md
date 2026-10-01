# Implementation Plan: Platform Overview Recharts Visualizations & Audit Trail Suite

This plan establishes a comprehensive visual **Platform Overview Dashboard** using `recharts` and builds a dedicated, full-history **Audit Trail** tab in the super admin console (`/platform`) with action type, severity, and actor search filters, plus one-click CSV export, accompanied by the required database schema script.

---

## User Review Required

> [!IMPORTANT]
> - **Visualizations (`recharts`)**:
>   1. **Total Church Count & Growth**: Cumulative and new church signups over time.
>   2. **Active Check-ins Over Time**: Interactive area chart with a **30-day daily trend** and a **90-day view toggle** showing daily congregation check-ins, online attendance, and QR scans across all churches.
>   3. **Subscription Tiers Distribution**: Donut / Pie chart displaying Free, Basic, Standard, and Premium distribution with percentages and revenue weights.
> - **Audit Trail System**:
>   - Dedicated administrative log tracking critical operations:
>     - Church permanent deletions (`tenant.permanently_purged`)
>     - Maintenance mode toggles & emergency lockdowns (`system.maintenance_toggled`)
>     - Global broadcast banner announcements (`system.broadcast_updated`)
>     - Operator credential and profile changes (`operator.profile_updated`, `operator.password_changed`)
>     - Plan feature config toggles (`plan.config_updated`)
>   - **Filters**: Filter by Action Category (*All, Church Lifecycle, System & Lockdown, Security, Commercials*), Severity (*Critical, Warning, Info*), and live Actor/Church keyword search.
>   - **One-Click CSV Export**: Download complete administrative audit records with full JSON details.
> - **Database Schema Migration (`schema-update-platform-overview-and-audit.sql`)**:
>   - Schema for `platform_audit_events` with category, severity, actor username, and indexed lookup.
>   - Analytics trend function `get_platform_metrics_trend(p_days)` for time-series attendance and church metrics.

---

## Proposed Changes

### 1. Database Schema (`schema-update-platform-overview-and-audit.sql`)
- Create / upgrade `public.platform_audit_events` table with:
  - `action`, `category` (`tenant`, `system`, `security`, `commercial`), `severity` (`info`, `warning`, `critical`), `actor_username`, `tenant_name`, `detail` (jsonb), and `created_at`.
- Function `public.log_platform_audit(...)` for recording administrative events.
- Time-series aggregation function for attendance and church counts.

### 2. Platform Overview Dashboard (`src/components/platform/PrimeOverview.tsx`)
- Embed responsive `recharts` components:
  - **Check-ins Over Time Area Chart**:
    - Toggle button between **Last 30 Days** and **Last 90 Days**.
    - Custom tooltip showing date, daily attendance count, and peak day markers.
  - **Tier Distribution Donut Chart**:
    - Visual breakdown by plan tier with color-coded legend, percentages, and total church count.
  - **Church Growth Chart**:
    - Bar / Area chart tracking cumulative church activations.
  - **Key Metrics KPI Grid**:
    - Quick metrics cards: Total Churches, Active Check-ins (30d), Total Members, MRR / Revenue, and System Health.

### 3. Dedicated Audit Trail Component (`src/components/platform/PrimeAuditTrail.tsx`)
- Create dedicated component for the `/platform` Audit Trail:
  - Action Category selector pills: *All Events*, *Critical Actions*, *Church Purges*, *System Controls*, *Security*.
  - Severity level filter dropdown: *All Severities*, *Critical (Red)*, *Warning (Amber)*, *Info (Blue)*.
  - Search input for operator username, church name, or action keyword.
  - JSON payload inspection modal / expandable drawer for each audit event.
  - One-click **"Export Audit Trail (CSV)"** button.
- Integrate into `src/routes/platform.tsx` under the **Audit log** tab.

### 4. Wire Critical Actions to the Audit Logger
- Record audit log entries on:
  - Church permanent purge (`delete_church_permanent`)
  - Maintenance mode toggle & emergency lockdown
  - Global broadcast banner update
  - Operator profile / username changes

---

## Verification Plan

### Automated Verification
- Run `compile_applet` to confirm zero TypeScript compilation errors.
- Run `lint_applet` for code style and formatting.

### Manual Verification
1. Open `/platform` (Overview):
   - Confirm the three `recharts` visualizations render with clean tooltips and correct data.
   - Toggle between **30-day** and **90-day** on the check-ins chart to confirm timeframe switching.
2. Open `/platform` (Audit Log / Trail):
   - Filter by "Critical Actions" to see church deletions.
   - Filter by severity and search by operator username.
   - Click "Export Audit Trail (CSV)" and verify downloaded CSV contains structured event rows.
3. Review `schema-update-platform-overview-and-audit.sql` for idempotency and security rules.
