# Walkthrough Spotlight Cutout, Support Sender Branding, & Ticket Resolution Lock Plan

This implementation plan addresses the three issues identified by the user:

1. **Walkthrough Spotlight Hole vs Blur**: The current walkthrough was blurring the entire screen including the target feature. We will implement a clean 4-panel cutout spotlight where the target element remains 100% crisp, unblurred, and directly clickable, while the rest of the page is dimmed and blurred.
2. **Support Church Sender Identity**: In `support-console.tsx`, `support.tsx`, and backend notifications, replace generic "Church Submitter" / "Your Church" with the real church name and tier status indicator: `[HQR]` for headquarters / parent church and `[BRE]` for branch church (e.g. `GCYC Exusia [HQR]` or `ICGC Kumasi [BRE]`).
3. **Resolved Support Ticket Locking**: Once a support ticket is marked as `resolved` (or `closed`), lock the reply composer so the conversation cannot be reopened. The church can still view the entire chat history in read-only mode with a clear resolution banner.
4. **Single-Shot Automated Support Response**: Ensure the predefined support greeting (*"Hello [Church], thank you for contacting Mene:Log Live Support Desk..."*) only triggers on the ticket's very first creation message. Do not trigger or re-insert the automated message when the church sends follow-up replies or when support responds.

---

## Proposed Changes

### 1. Walkthrough Spotlight Cutout (`src/components/walkthrough/WalkthroughTour.tsx`)
- Replace the monolithic full-screen backdrop with a **4-panel cutout window** surrounding `targetRect` (top, bottom, left, right).
- The cutout area over the target feature will have **zero blur and zero overlay**, keeping the actual buttons, menus, and text 100% sharp and visible.
- The 4 surrounding panels will apply `bg-slate-950/50 backdrop-blur-sm` to softly dim and blur the rest of the page.
- Direct click handling: Clicks inside the spotlight window will interact directly with the underlying control, enabling seamless guided navigation.
- The glowing primary ring and pulsing radar beacon remain positioned around the cutout border.

### 2. Church Sender Identification (`src/routes/support-console.tsx`, `src/routes/_app/support.tsx`, `src/lib/support.functions.ts`)
- In `src/routes/support-console.tsx`:
  - When rendering replies where `isChurch` is true, replace the hardcoded `"Church Submitter"` label with:
    `{churchName} [{isBranch ? "BRE" : "HQR"}]`
    (e.g., `"GCYC Exusia [HQR]"` or `"ICGC Kumasi [BRE]"`).
  - Also ensure the left profile sidebar clearly identifies the church type as **Headquarters / Main Campus [HQR]** or **Branch Campus [BRE]**.
- In `src/routes/_app/support.tsx`:
  - When rendering church messages in the client thread, show `{tenant?.name || "Your Church"} [{tenant?.parent_tenant_id ? "BRE" : "HQR"}]`.
- In `src/lib/support.functions.ts` & `src/lib/support.server.ts`:
  - Include the branch tag in notification emails and SMS alerts (e.g. `"New ticket from GCYC Exusia [HQR]"`).

### 3. Resolved Ticket Chat Lock (`src/routes/_app/support.tsx`, `src/lib/support.functions.ts`)
- In `src/routes/_app/support.tsx`:
  - When `selectedTicket.status === "resolved"` or `selectedTicket.status === "closed"`:
    - Disable or replace the reply Textarea and Send button with a dedicated resolution notice banner:
      *"✓ This ticket has been marked as Resolved. The conversation is closed. If you need assistance with another matter, please submit a new ticket."*
    - The chat message history remains completely accessible in read-only mode.
- In `src/lib/support.functions.ts` (`replyChurchTicket`):
  - Add backend validation: If `ticket.status === "resolved"` or `"closed"`, reject the reply with an error preventing reopening.

### 4. Single-Shot Auto-Responder (`src/lib/support.functions.ts`)
- In `src/lib/support.functions.ts`:
  - `submitChurchTicket`: Retain the automated instant greeting for the **first message** when a ticket is opened.
  - `replyChurchTicket`: **Remove** the secondary `generateInstantSupportResponse` invocation that was re-inserting the automated response on every follow-up reply.
  - When support staff replies from `support-console.tsx`, ensure no automated messages are inserted.

---

## Verification Plan

### Automated Checks
- Run `lint_applet` to verify no TypeScript or lint warnings.
- Run `compile_applet` to ensure full build compiles cleanly.

### Manual / Browser Verification
1. **Spotlight Cutout**: Open the walkthrough; verify that the active sidebar/page feature is completely sharp, unblurred, and clickable, while the surrounding page is dimmed and blurred.
2. **Support Sender Name**: Check ticket messages in the support console; verify they display the church name with `[HQR]` or `[BRE]` instead of "Church Submitter".
3. **Resolved Ticket Lock**: Mark a ticket as resolved; confirm the chat is viewable but the reply composer is locked.
4. **Auto-Reply**: Send a follow-up reply in a ticket; confirm that the predefined greeting is not triggered a second time.
