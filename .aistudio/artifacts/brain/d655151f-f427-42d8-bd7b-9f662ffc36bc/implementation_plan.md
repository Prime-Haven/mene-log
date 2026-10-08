# Onboarding Walkthrough Guide & Dashboard Tutorial Video

Implement an interactive, tier-aware walkthrough guide for first-time church signups that spotlights active features, guides page actions, removes the video from the hero section, and adds a dedicated tutorial video banner to the main dashboard.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following confirmed decisions guide this execution:
> - **Interactive Spotlight Beacons**: Walkthrough will use interactive spotlight beacons and callouts anchored to active sidebar navigation items and page controls.
> - **Strict Tier-Aware Feature Gating**: Locked features under lower tiers will **not** be included in the walkthrough. On Premium accounts (or active tiers), all available features will have their step-by-step guidance.
> - **Sub-Page Guidance**: When a user clicks a feature and enters its page, context-sensitive guided callouts highlight primary controls (e.g. Add Member, Launch Kiosk, Create Service).
> - **Hero Video Removal**: The video modal and button in the public landing page hero section will be replaced with a clean "Explore Platform" anchor action.
> - **Dedicated Dashboard Tutorial Video Banner**: As the final step after completing the walkthrough (or accessible directly on `/dashboard`), a dedicated video banner will feature the tutorial player with an easily replaceable demo video source.

---

## 1. Overview & Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NEW CHURCH ONBOARDING FLOW                         │
│                                                                             │
│  [Complete Onboarding]                                                      │
│           │                                                                 │
│           ▼                                                                 │
│  [Enter Dashboard (First Time)]                                             │
│           │                                                                 │
│           ▼                                                                 │
│  [Walkthrough Spotlight Tour Launches]                                      │
│    • Step 1: Dashboard Overview                                             │
│    • Step 2: Door Check-In & Scanner (active on all tiers)                  │
│    • Step 3: Attendance Register (active on all tiers)                      │
│    • Step 4: Services Setup (active on all tiers)                           │
│    • Step 5: Member Directory (active on all tiers)                         │
│    • Step 6+: Pro/Premium Features (Follow-ups, Leaders, Reports,           │
│               Messaging, Structure, Branches, Billing — ONLY if unlocked)   │
│           │                                                                 │
│           ▼                                                                 │
│  [Final Step: Dedicated Tutorial Video Banner on Dashboard]                 │
│    • Plays demo video with easy code replacement slot                       │
│    • Once watched or dismissed, full workspace is ready                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. User Experience & Flows

### A. Walkthrough Spotlight Engine (`src/components/walkthrough/WalkthroughTour.tsx`)
- **First-Time Detection**: Automatically opens on `/dashboard` if `menelog_walkthrough_completed_${tenantId}` is false in `localStorage`.
- **Spotlight Anchors (`data-tour="..."`)**:
  - `data-tour="nav-dashboard"`: "Operations Hub — View your weekly Sunday headcounts, demographics, and first-timer trends."
  - `data-tour="nav-scan"`: "4-Second Door Scanner — Launch mobile camera scanning or tablet kiosk check-in."
  - `data-tour="nav-attendance"`: "Live Attendance Register — View present attendees, manual overrides, and timestamps."
  - `data-tour="nav-services"`: "Church Services — Create Sunday services, prayer meetings, and live streams."
  - `data-tour="nav-members"`: "Member Directory — Add congregation profiles, upload photos, and track family data."
  - `data-tour="nav-followups"`: *(Tier-gated)* "Pastoral Follow-ups — Track first-timers and check-in absence alerts."
  - `data-tour="nav-leaders"`: *(Tier-gated)* "Pastoral Leadership — Assign church leaders and department overseers."
  - `data-tour="nav-reports"`: *(Tier-gated)* "Ministry Analytics — Generate growth reports and export member records."
  - `data-tour="nav-messaging"`: *(Tier-gated)* "Broadcast Announcements — Send instant SMS and Email notifications."
  - `data-tour="nav-structure"`: *(Tier-gated)* "Congregation Structure — Set up committees, departments, and cells."
  - `data-tour="nav-branches"`: *(Tier-gated)* "Multi-Branch Oversight — Manage campuses and satellite parishes."
  - `data-tour="nav-billing"`: "Plans & Space Addons — Manage your 30-day trial and church packages."
- **Page-Level Sub-Guides**:
  - On `/members`: highlights "Add Member" button and Search/Filter bar.
  - On `/services`: highlights "Create Service" button.
  - On `/scan`: highlights "Kiosk Mode" and Camera Scanner.
- **Controls**: "Next", "Back", "Skip Walkthrough", plus a "Restart Walkthrough" option in the user profile menu.

### B. Dashboard Tutorial Video Banner (`src/components/dashboard/DashboardTutorialBanner.tsx`)
- Appears prominently near the top of `/dashboard` after walkthrough completion (or collapsed/expandable).
- High-fidelity player styling with poster frame, play/pause controls, time display, and fullscreen.
- Includes a dedicated code comment and configuration variable:
  ```ts
  // TUTORIAL VIDEO SOURCE CONFIGURATION:
  // Replace this path with your finalized video asset or direct URL/embed
  export const DASHBOARD_TUTORIAL_VIDEO_SRC = "/assets/mene-worship-hero.webm";
  ```
- Action buttons: "Mark as Watched", "Dismiss Banner", and "Replay Tutorial".

### C. Hero Section Simplification
- In `src/components/landing/HeroSection.tsx`:
  - Remove `Watch Interactive Tour` video modal trigger and play button.
  - Replace with a clean, elegant anchor button:
    `<a href="#features" className="...">Explore Capabilities</a>`
  - In `src/routes/index.tsx`:
    - Remove `HeroShowreelModal` component and `showreelOpen` state.

---

## 3. Technical Implementation Steps

### Step 1: Create Walkthrough Tour Engine
- Create `src/components/walkthrough/WalkthroughTour.tsx` and `src/components/walkthrough/walkthrough-context.tsx`.
- Connect to `useTenant()` so active tier filters out any features where `ctx.can(feature)` is false.
- Inject `data-tour` attributes into `src/routes/_app/route.tsx` for all sidebar navigation links.
- Add page-level tour targets on `/dashboard`, `/members`, `/services`, and `/scan`.

### Step 2: Create Dashboard Tutorial Video Banner
- Create `src/components/dashboard/DashboardTutorialBanner.tsx`.
- Place a working video player referencing the bundled video (`@/assets/mene-worship-hero.webm`).
- Mount on `src/routes/_app/dashboard.tsx` with persistent dismiss/watched status.

### Step 3: Remove Video from Landing Hero
- In `src/components/landing/HeroSection.tsx`, replace the `Watch Interactive Tour` button with an "Explore Capabilities" link.
- In `src/routes/index.tsx`, remove `HeroShowreelModal` imports and rendering.

### Step 4: Verification
- Verify build with `lint_applet` and `compile_applet`.
- Verify tier gating: simulate Free, Standard, and Premium to confirm locked items never show in the walkthrough.
- Verify video playback and dismiss persistence.
