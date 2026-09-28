# Tiered account dashboard redesign

## Goal

Rework the signed-in Mene:Log experience to match the supplied operations-dashboard structure while retaining the existing Cloud White palette, Sora headings, Manrope body text, and church branding.

## What will change

- Refine the permanent left sidebar into a denser, grouped workspace navigation with church identity, package label, collapse control, and account actions.
- Add a compact desktop header with the current page, church context, and fast actions; keep a native app-like mobile header and drawer.
- Redesign the dashboard as a scannable operations view: greeting band, service/date controls, compact KPI tiles, attendance trend, demographic summaries, and upcoming church activity.
- Keep the dashboard useful when records are empty with clear next actions instead of large blank panels.
- Animate page entry, KPI reveal, navigation state, and control feedback with restrained Framer Motion transitions and reduced-motion support.

## Package behaviour

- **Basic:** core attendance, members, services, reports, email, settings, accounts, billing, and audit access.
- **Standard:** adds leaders, structure, messaging, advanced insights, automations, and extra member space.
- **Premium:** includes Standard capabilities plus branch-aware views, SMS, and the highest limits.
- Navigation and dashboard actions remain driven by existing entitlements; unavailable features will not leak into lower-tier accounts.

## Responsive behaviour

- Desktop uses the compact sidebar and dense dashboard grid from the reference.
- Mobile becomes a focused app view with a sticky top bar, drawer navigation, horizontally safe controls, and two-column or single-column KPI tiles as space allows.

## Validation

- Check Basic, Standard, and Premium visibility rules in source and through authenticated views available in the project.
- Verify desktop and mobile layouts, navigation, empty states, motion, and no overlapping text or controls.
- Run the project’s type validation and inspect browser errors before completion.
