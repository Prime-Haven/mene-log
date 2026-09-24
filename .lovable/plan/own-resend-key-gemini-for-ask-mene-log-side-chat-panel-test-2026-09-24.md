# Own Resend key, Gemini for Ask Mene:Log, side chat panel, test accounts, live stats

## 1. Email through your own Resend account
- Disconnect the Lovable Resend connector from this project.
- Rewrite the email sender to call Resend directly with your own key (saved securely as `MENELOG_RESEND_API_KEY`) plus a sender address (`MENELOG_EMAIL_FROM`, e.g. `Mene:Log <no-reply@menelog.site>`).
- Every email (verification, staff/leader invites, receipts, welcome, birthday, absence, broadcasts) goes through this one sender, so nothing else changes.
- After approval I'll open a secure form for your Resend API key and sender address. Your domain (menelog.site) must be verified in Resend for emails to reach anyone.

## 2. Gemini for Ask Mene:Log
- Switch both assistants (the church-account Ask Mene:Log and the homepage helper) to Google Gemini via Lovable AI. No key is needed from you.

## 3. Homepage Ask Mene:Log panel
- Replace the centered popup with a tall rounded panel that springs in from the bottom-right, with a chat thread (your questions and its answers) and a message box.
- The button stays hidden while you're on the hero section and fades in once you scroll past it, then hides again when you scroll back up.

## 4. Test accounts for each plan
- Create four churches with a confirmed admin login each: Free, Standard, Pro, Premium (active, not trial).
- I'll give you the emails and passwords in chat. Note: 2FA is required at sign-in, so you'll set up Google Authenticator on first login for each.

## 5. "Growing together" shows real numbers
- Confirm the stats function counts only real data: active churches, members, check-ins, average Sunday attendance. Show 0 when empty (and 0 if loading fails, instead of a dash). Test accounts will add to the churches count. Tell me if they should be left out.

## Technical details
- `messaging.server.ts`: `fetch("https://api.resend.com/emails")` with `Authorization: Bearer MENELOG_RESEND_API_KEY`. Drop the `LOVABLE_API_KEY` requirement and surface Resend errors.
- `ask-mene.ts`, `product-help.ts`: `createLovableAiGatewayProvider` + `google/gemini-3.8-flash` via chat completions. Remove the Responses-only options.
- `PublicAskMene.tsx`: framer-motion side sheet, IntersectionObserver on the hero to toggle visibility.
- Accounts: created with the admin auth API plus `provision_tenant`, then the tier and subscription set directly.
- `HomepageStats.tsx`: default to 0. Check `public_platform_stats()` against live row counts.
