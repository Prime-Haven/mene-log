# Patmos member check-in, church branding, and mobile app upgrade

## Goal

Give every Patmos church—Basic, Standard, and Premium—a branded public member-registration and attendance experience, while making the signed-in dashboard feel like an installable mobile app.

## 1. Expand the member record safely

- Add marital status and occupation to member records through an additive database migration; keep location in the existing residential-area field.
- Update the public form, admin add-member form, member search/display, spreadsheet import, CSV export, anonymisation, and relevant reports to support:
  - Full name
  - Contact number
  - Email (optional)
  - Date of birth
  - Gender
  - Marital status
  - Location
  - Occupation
  - Service Type
- Keep contact number required for reliable returning-member matching and retain the existing protection for minors’ contact details.
- Validate lengths and allowed values in the browser, server function, and database function.

## 2. Let visitors choose the service

- Expose only the selected church’s currently open services through a narrowly scoped public server function.
- Add a required service selector to the public church form.
- Pass the selected service ID into check-in and verify server-side that it belongs to the same church and is open before recording attendance.
- Remove the current “pick the latest service automatically” behavior so attendance always goes to the visitor’s explicit selection.
- Show a clear unavailable state when the church has no open service.

## 3. Generate and save the member QR code

- Continue generating a new cryptographically random member token while storing only its hash in the database.
- Render the returned member code as a QR image after successful registration/check-in.
- On Android and desktop, automatically start the PNG download and retain a visible download button as a fallback.
- On iPhone/iPad, show a prominent **Save to my device** action using the native share/save sheet when supported, with a direct image fallback when it is not.
- Keep the QR visible onscreen so a visitor never loses access if a browser blocks downloading.

## 4. Full church branding for every package

- Add tenant branding settings for primary/accent colours, welcome message, submit-button wording, logo, and optional background image.
- Provide an owner/admin branding editor with uploads, colour controls, text fields, and a live preview.
- Store public branding media in a dedicated Lovable Cloud storage area with tenant-isolated upload/update rules, file type and size limits, and randomized paths.
- Apply each church’s branding to its public member/check-in form and attendance success screen without weakening readability or accessibility.
- Replace the Patmos icon in the signed-in sidebar header with the church logo when available; always show the church name, with a polished fallback mark.
- Make branding available equally to Basic, Standard, and Premium churches.

## 5. Mobile-first signed-in experience

- Replace the current mobile horizontal navigation bar with a vertical slide-out sidebar opened from an always-visible menu button.
- Keep a permanent collapsible vertical sidebar on larger screens.
- Add safe-area spacing, compact headers, stable touch targets, mobile-friendly tables/actions, and focused full-width task screens so the dashboard feels native on phones.
- Preserve role and package visibility rules for every navigation item.

## 6. Framer Motion polish

- Add Framer Motion and use restrained transitions for the slide-out sidebar, page content, dialogs, QR success state, and feedback messages.
- Respect reduced-motion preferences and avoid animations that delay scanning, saving, or form submission.

## 7. Installable web app

- Add manifest-only home-screen support with Patmos name, standalone display mode, theme colours, and complete app icons.
- Add manifest, theme-colour, Apple touch icon, and favicon links to the document head.
- Add an **Install Patmos** action where browser installation is available, plus concise iPhone guidance for **Add to Home Screen**.
- Do not add offline caching; the installed icon will open the live secure site and always use current church data.

## 8. Security and verification

- Keep public writes behind validated server functions and security-definer database functions; do not expose member tables or branding administration publicly.
- Preserve IP and church-level rate limits, tenant isolation, subscription checks, audit events, duplicate-attendance protection, and hash-only QR storage.
- Regenerate database types after the migration.
- Verify the Basic, Standard, and Premium demo churches end to end: branding changes, open-service selection, all fields, attendance creation, QR scan, Android-style download, iPhone save flow, and install prompt/fallback.
- Test phone and desktop layouts, sidebar opening/closing, logo/background rendering, reduced motion, and all route metadata.

## Technical notes

- Schema changes are additive; existing member and church data remain valid.
- Existing dated/open service records remain the source for the new public service selector.
- Runtime church colours will be mapped into scoped semantic CSS variables rather than hardcoded page colours.
- App installation uses a web manifest only, matching the requested home-screen behavior without introducing offline cache risks.
