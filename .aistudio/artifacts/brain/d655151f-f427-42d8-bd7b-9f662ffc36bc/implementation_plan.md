# Fix Hero Attendance Metric to Read Real Database Count

Resolve the issue where the "Attendance" metric displayed a hardcoded `"98.5%"` percentage fallback instead of the live database count from PostgreSQL.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following confirmed choice guides this fix:

- **Confirmed Decision (Metric Presentation)**: Display the exact numerical Sunday attendance average directly from the database (showing `0` when no Sunday check-ins exist yet, or the exact count like `42`, `150`, `1.2k` as data is logged), formatted consistently with the other three database metrics.

---

## 1. Overview & Root Cause Analysis

- **Why it showed `98.5%`**:
  - In `src/components/landing/HeroSection.tsx`, the attendance metric was formatted as:
    ```tsx
    const attendanceCount = statsQuery.data?.average_sunday_attendance
      ? compactNumber.format(statsQuery.data.average_sunday_attendance)
      : "98.5%";
    ```
  - In JavaScript, `0` is a falsy value.
  - The live Supabase RPC `public_platform_stats()` returned:
    ```json
    { "churches": 4, "members": 2, "checkins": 1, "average_sunday_attendance": 0 }
    ```
  - Because `average_sunday_attendance` was `0`, the ternary operator treated `0` as falsy and evaluated the alternative branch: `"98.5%"`.
  - Furthermore, `average_sunday_attendance` in the database is an **integer headcount** (the rounded average number of attendees on Sundays), not an attendance percentage. Hardcoding a `%` symbol was incorrect.

- **The Fix**:
  - Check `statsQuery.data?.average_sunday_attendance != null` (or `typeof === 'number'`) so `0` is preserved and rendered as `0` via `compactNumber.format(0)`.
  - Apply the same null-safe numeric checks to `churches`, `members`, and `checkins` so live database data is always faithfully represented.

---

## 2. User Experience & Visual Design

- **Hero "Growing Together" Panel (4-Column Layout)**:
  - **Churches**: Live count from `tenants` (e.g., `4`).
  - **Members**: Live count from `members` (e.g., `2`).
  - **Check-ins**: Live total count from `attendance` (e.g., `1`).
  - **Attendance**: Live Sunday average headcount from `attendance` (e.g., `0`), with sub-label *"Sunday average"*.
- **Consistency**: All four metrics use `font-display tabular-nums font-extrabold text-2xl sm:text-3xl text-white` with identical formatting rules.

---

## 3. Technical Architecture & Implementation Steps

### Step 1: Update Metric Formatter in `HeroSection.tsx`
Replace the truthiness ternaries with strict nullish coalescing:
```tsx
const churchesCount =
  typeof statsQuery.data?.churches === "number"
    ? compactNumber.format(statsQuery.data.churches)
    : statsQuery.isLoading ? "—" : "0";

const membersCount =
  typeof statsQuery.data?.members === "number"
    ? compactNumber.format(statsQuery.data.members)
    : statsQuery.isLoading ? "—" : "0";

const checkinsCount =
  typeof statsQuery.data?.checkins === "number"
    ? compactNumber.format(statsQuery.data.checkins)
    : statsQuery.isLoading ? "—" : "0";

const attendanceCount =
  typeof statsQuery.data?.average_sunday_attendance === "number"
    ? compactNumber.format(statsQuery.data.average_sunday_attendance)
    : statsQuery.isLoading ? "—" : "0";
```

### Step 2: Verification
- Verify with `lint_applet` and `compile_applet`.
- Verify the rendered output against the live Supabase RPC response.
