# Implementation Plan - Services Architecture & Attendance Tracking

Implement a comprehensive service management and attendance tracking system with permanent default services (Sunday Service, Midweek Service, Prayer Service), full CRUD operations for custom/special themed services, dedicated tracking tabs on the Services page, date/day-of-week validation, tier-based feature access control, and seamless synchronization with public check-in pages.

---

## 1. Objectives & User Requirements
1. **Permanent Default Services**:
   - Standardize `Sunday Service`, `Midweek Service`, and `Prayer Service` as permanent baseline service templates for every tenant.
   - Prevent accidental deletion of default service archetypes while allowing administrators to edit times, themes, active toggle status, and details.
2. **Dedicated Services Tracking Hub**:
   - Provide dedicated categorization tabs: **Sunday Services**, **Midweek Services**, **Prayer Services**, and **Special & Themed Services**.
   - Track attendance trends, session-by-session counts, and date-range filters (specific date, weekly period, custom date range).
3. **Custom & Themed Services Creation (Admin CRUD)**:
   - Allow admins to create custom services or themed Sunday/midweek events (e.g., *"Covenant Sunday - Theme: Supernatural Breakthrough"*, *"Anointing Night"*, *"Youth Camp Vigil"*).
   - Full CRUD: Create, View, Edit (theme, speaker, date, time, target attendance, stream URL), Toggle Open/Closed for check-in, and Delete (with confirmation and cascade safeguards).
4. **Day-of-Week & Attendance Date Integrity**:
   - Ensure Sunday services validate or prompt when configured on Sundays.
   - Provide flexible scheduling for midweek and prayer services, automatically recording and displaying the exact day-of-week alongside the calendar date (e.g., `Wednesday, Oct 14, 2026`).
5. **Public Check-In Synchronization**:
   - Update the public check-in page (`/c/$subdomain`) and usher scanner (`/scan`) so active default services and newly created admin services immediately appear in the check-in selection dropdown.
   - Ensure member attendance taken for any selected service links cleanly to the attendance register and reports.
6. **Tier-Gated Feature Control**:
   - Provide full administrative control over data within the limits of the tenant's subscribed tier (Free, Basic, Standard, Premium), honoring branch limits, export features, and storage quotas cleanly without blocking core attendance recording.

---

## 2. Proposed Changes & Architecture

### Database Schema Updates (`drizzle/schema.ts` & Migration)
- Ensure the `services` table supports:
  - `is_default: boolean` (default `false`) to flag permanent core services (`Sunday Service`, `Midweek Service`, `Prayer Service`).
  - `service_category: text` (`'sunday' | 'midweek' | 'prayer' | 'special'`).
  - `theme: text` for special themes or titles (e.g., *"Supernatural Abundance"*).
  - `day_of_week: text` for easy grouping and period tracking.
  - Safe deletion policy: default services cannot be deleted (only toggled inactive if unused), whereas custom/special services can be deleted with their attendance records.

### Frontend Pages & Components
#### A. Services Hub (`/src/routes/_app/services.tsx`)
- **Category Tabs**:
  - `Sunday Service`: Filtered list and aggregate metrics for Sunday services.
  - `Midweek Service`: Filtered list and metrics for Midweek gatherings.
  - `Prayer Service`: Filtered list and metrics for Prayer meetings.
  - `Special / Themed Programs`: Admin-created custom programs and special services.
  - `All Services`: Comprehensive overview.
- **Service CRUD Modals**:
  - **Create Service**: Form with Name, Theme/Subtitle, Category selector, Date picker, Time, Speaker, Target Attendance, and Live Stream link.
  - **Edit Service**: Update any field of existing services.
  - **Delete Service**: Confirmation dialog for custom services (explaining attendance implications). Deletion disabled for default templates.
- **Period & Date Filtering**:
  - Quick filters for "This Week", "This Month", "Last 30 Days", or custom date selector.
  - Direct quick-link to open the Attendance Register (`/attendance?serviceId=...`) or Scanner (`/scan?serviceId=...`).

#### B. Public Check-In Page (`/src/routes/c.$subdomain.tsx`)
- Load all active open services for the church (including current default Sunday/Midweek/Prayer services and any custom admin-created services).
- Service selector dropdown with clear badges for Service Type, Date, and Theme.

#### C. Scanner & Check-In Hubs (`/src/routes/_app/scan.tsx` & `/src/routes/_app/attendance.tsx`)
- Ensure the active service selector includes all current default and custom services.
- Show day-of-week context beside each service option (e.g., `Sunday Service • Sunday, Sep 28`).

#### D. Tier & Permission Enforcement
- Integrate tier entitlement checks so admins have full operational autonomy over their service schedules, check-in flows, and attendance data according to their subscription tier.

---

## 3. Verification & Testing Plan
1. **Compilation & Linting**:
   - Run `npx prettier --write` and `npm run lint` to guarantee clean code and zero syntax warnings.
   - Run `compile_applet` to ensure full TypeScript compilation.
2. **Functional Verification**:
   - Verify default Sunday, Midweek, and Prayer services are created and protected from deletion.
   - Create a themed custom service (e.g., special Sunday theme or mid-week summit) and verify it appears in the **Special** tab and the **All Services** tab.
   - Verify editing updates the record immediately and reflects in the UI.
   - Test deleting a custom service to verify safe removal.
   - Check `/c/$subdomain` and `/scan` to verify the newly created service appears immediately for member check-in.
   - Record an attendance check-in for the custom service and verify it tracks under the correct tab and attendance register.
