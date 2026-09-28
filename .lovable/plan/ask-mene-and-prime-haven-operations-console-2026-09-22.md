# Ask Mene and Prime Haven operations console

## Goal

Add a secure, church-scoped AI assistant for administrators, create the Prime Haven superadmin account for `primehaven26@gmail.com`, complete the platform operations console, and add restrained Framer Motion transitions throughout the signed-in experience.

## Ask Mene

- Add an **Ask Mene** item to the church sidebar for owners and church administrators.
- Build one saved conversation per church, shared only by that church’s authorised administrators across devices.
- Use AI Elements for the transcript, messages, reasoning/loading state, and composer.
- Stream answers from Lovable AI using `openai/gpt-6-astra`, with visible concise reasoning summaries and a stop control.
- Ground every answer in a server-produced, aggregate-only church snapshot: attendance trends, service totals, first-timer totals, demographics, branch/group summaries, and package limits.
- Never provide the model with names, phone numbers, email addresses, dates of birth, QR tokens, message bodies, or other member-level records.
- Store only the administrator’s question and final answer; do not store hidden reasoning.
- Include useful starter questions, empty/error states, clear-history control, per-user and per-church rate limits, input/output size limits, audit records, and safe gateway error messages.

## Prime Haven superadmin

- Create and assign a dedicated platform operator account for `primehaven26@gmail.com`; provide a temporary password for first sign-in.
- Keep platform roles separate from church roles and validate platform access in the database/server on every operation.
- Redesign `/platform` as a protected Prime Haven console with overview metrics, package distribution, billing health, searchable church registry, status/package filters, and church detail panels.
- Add safe operational actions: create a church shell, edit church account metadata/package/status, suspend/restore/close accounts, and inspect platform audit history.
- Do not expose church member rows, contacts, attendance rows, messages, QR tokens, or church audit details. Platform metrics remain aggregate counts only.
- Require confirmation for impactful actions, validate all inputs, rate-limit mutations, log every action, and return actionable errors.

## Data protection

- Add RLS-protected Ask Mene conversation storage and platform audit storage, with explicit authenticated/service grants.
- Add narrowly scoped security-definer functions for aggregate Ask Mene context and platform CRUD; revoke public execution and grant only the roles that need each function.
- Preserve tenant isolation and prevent a platform administrator from inheriting church membership or bypassing church RLS.
- Review and tighten execution grants on the new functions, then run the database linter.

## Motion and polish

- Add shared reduced-motion-safe Framer Motion presets for page entrances, staggered cards/lists, navigation, drawers, result states, and modal/detail transitions.
- Apply them to the signed-in shell, Ask Mene, and platform console without slowing frequent admin work or moving fixed data layouts.
- Verify desktop and mobile layouts, keyboard focus, loading/error states, and the complete Ask Mene and platform workflows.

## Technical details

- Streaming endpoint: authenticated TanStack server route; Lovable AI key remains server-only.
- Conversation storage: one tenant conversation enforced by database uniqueness and tenant-admin RLS.
- AI access: aggregate snapshot created only after tenant-admin verification; gateway request is rate-limited and audited.
- Platform writes: authenticated server functions/database RPCs; no privileged browser client.
- Install AI SDK/AI Elements dependencies and use the official Conversation, Message, Prompt Input, Shimmer, and Reasoning components.
