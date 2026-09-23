# WhatsApp: operational completion — 23 September 2026

This delivery extends the existing provider, message, automation, contact and campaign services. It does not claim completion of the entire 199-row requirements matrix. The deployment remains a single-business application with one active sender; multi-business isolation must be implemented before hosting another business in this database.

## Delivered behavior

- Internal notes can be written in the inbox, including on mobile, and appear on the existing CRM contact. They have separate styling, author and timestamp and never create an outbound message. The API locks the conversation before checking agent access and stores the note and audit event in the same transaction.
- Contact details, lead source, existing tags and up to 50 custom fields can be edited in the contact card linked from the inbox. Duplicate field names/tags are rejected. Updating tags previously passed validation without updating the join records; this is fixed. Owner assignment remains conversation-based.
- Managers/admins can export up to 10,000 contacts matching the current search to UTF-8 CSV. Larger exports fail explicitly instead of truncating. Agent access is denied and exports are audited. Spreadsheet formula prefixes are escaped, including the leading `+` in phone numbers; consumers importing the CSV must treat these cells as text/remove the protective apostrophe when appropriate. This is an export format, not a lossless reimport format for the current importer.
- Initial conversation history is bounded to 100 messages. Earlier pages use `(createdAt,id)` boundaries, avoiding duplicate/missing messages with equal timestamps. New polling snapshots merge with loaded history; prepending messages preserves scroll position.
- Campaigns can be copied into a new draft using current list membership, approved template and sender snapshots. No schedule, send status or message IDs are inherited. The copy must pass the existing preflight before activation. Search explicitly covers the most recent 100 campaigns; older campaign search remains a gap.
- Provider-rejected or uncertain automated messages no longer count as successful automation runs. Outbound automation sends use a request key derived from their run ID; this is not an exactly-once guarantee across separate runs.
- New no-reply timers retain the action configuration and triggering inbound timestamp. A later inbound message invalidates the old timer instead of causing it to fire early. Existing legacy pending runs without these snapshots retain legacy behavior; full automation versioning remains incomplete.
- Adding an already attached conversation tag does not re-fire its automation. Central stop disables all rules and marks pending runs skipped in one audited transaction. In-flight actions may finish; reactivation does not revive cancelled pending runs. This is not a permanent system-wide disable flag: managers can subsequently create or enable rules.
- Automation configuration now validates action fields and timer bounds (1–43,200 minutes). Template actions support explicit variable mapping and `{name}` personalization. Send-time approval/consent/window checks remain centralized in the message service.
- Contact/note editors reset their local state when switching contacts/conversations, preventing unfinished edits from carrying into another customer.
- Contact search no longer allows a slow older response to replace newer results. A full-block-only edit preserves the existing consent evidence/source/date instead of overwriting them.

## Validation

- `npm test`: **132 passing tests across 26 files**, including provider rejection, delayed-action snapshots, stale timers, note authorization, CSV formula escaping, export/stop/clone role restrictions, duplicate tag triggers and consent evidence preservation and internal-note form submission.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed; the final QA build also passed TypeScript.
- `node scripts/qa-environment.cjs build`: passed (production Next.js webpack build with QA-only runtime configuration).
- `npm run test:qa`: **8 passed in 464.48 seconds**, using real PostgreSQL in the isolated `solina_qa_20260923` schema and mocked Graph HTTP. Existing campaign, webhook, token-revocation, timeout and agent-isolation scenarios passed. New history fixture contains 205 messages with identical timestamps and verifies the latest 100 plus access denial for another agent.
- `node scripts/qa-browser.cjs --operations-only`: **passed** in Chromium against the isolated QA server. Verified UI lead creation/assignment, cross-agent denial, internal-note save and CRM linkage without an outbound message, contact field/source persistence, role-restricted export, 205-message pagination and scroll anchoring, campaign review/copy and central automation stop. No browser runtime errors.
- `node scripts/qa-browser.cjs --history-only`: **passed**, including a scroll-position assertion and all 205 equal-timestamp messages with no duplicates/gaps.
- The full browser run also verified approved-template sending in mock mode, service replies, draft refresh and private draft access before finding the note submit-button bug. After fixing it, the focused operational suite was completed. A subsequent full run was interrupted by the local server stopping; the legacy CSV/template-submission/mobile/password-reset tail was not rerun to completion in this delivery (its previous evidence remains in the earlier report). This is not reported as a new full-suite pass.
- Vercel final candidate `dpl_T7ibpXoH5zjdN4pfUhn57eeT2Q8G` (`654c610` application code): **authenticated smoke passed** for inbox, campaigns, templates, contacts, automations, settings and message snapshots; anonymous calls to new export/stop/copy/note endpoints denied. Built with production settings using `--skip-domain` before promotion.
- Production read-only security check: 22 public tables, **0 with RLS disabled, 0 public/anon/authenticated table grants**, 0 active non-mock provider credentials. Supabase security advisors returned no ERROR/WARN entries. Production remained at 262 contacts and 459 messages at this check.
- No live customer campaign or live Meta message was sent. Campaign and two-way messaging paths remain **not verified against live Meta**.

## Files, schema and configuration

No migration or new database table is needed for this delivery. Existing `Note`, `ContactCustomField`, `ContactTag`, `AutomationRun.triggerPayload`, `AuditLog`, `Campaign` and message records are reused. The previous send-safety migration remains a prerequisite.

New API routes:

- `POST /api/conversations/:id/notes`
- `GET /api/contacts/export?search=...`
- `POST /api/campaigns/:id/duplicate`
- `POST /api/automations/stop`

History pagination extends `GET /api/conversations/:id/messages` with paired `before` (ISO timestamp) and `beforeId` parameters and a `hasMore` result. Existing polling requests remain compatible.

New UI components: `internal-notes.tsx`, `contact-details-editor.tsx`, `stop-automations-button.tsx`. New tests: `operational-routes.test.ts`, `operational-tools.test.ts`, `contact-consent-editor.test.tsx`; existing automation, database and browser QA suites are extended.

No new production environment variables are required. Existing cron authentication, server database credentials and provider secrets remain required. Live Meta activation requires replacing active demo passwords, a valid WABA/phone/token/app secret, a verified webhook subscription, approved templates, documented recipient consent and an approved test recipient/device. Keep all tokens on the server.

## Remaining work and external dependencies

The [full matrix](qa/whatsapp-requirements-matrix.md) retains each requirement, priority and evidence: **65 implemented/tested, 94 partial, 28 missing, 12 blocked**. Implemented/tested includes simulations; it is not a count of capabilities verified with live Meta. Remaining local development includes multi-business isolation and multiple sender routing, saved AND/OR segments/exclusions, contact merge with preserved identities, full campaign wizard/test-recipient management, media/button templates, durable webhook event reconciliation, safe retry/backoff and per-number rate control, quiet hours, multistep/versioned automations, tasks/orders and external CRM adapters. These are development gaps, not all external blockers.

Live provider QA, account quality/throughput, template approval and actual costs are blocked by the absence of an active Meta account and approved test number. External CRM/order integration additionally needs the identity and access details of the external system. No unavailable data is replaced by unlabeled simulation.

Official documentation rechecked: [WhatsApp policy](https://whatsappbusiness.com/policy/) for consent, opt-outs, approved templates and the 24-hour reply window; [Supabase changelog](https://supabase.com/changelog) (latest entry 21 September 2026, Replication renamed Pipelines without API behavior changes). No pricing or throughput constants were inferred from these pages.

Deployment verification found that generic Vercel Preview has none of the production environment variables, so its Auth.js CSRF endpoint returns `MissingSecret`. Verification must use a production-environment candidate with `--skip-domain` before promotion, or a separately provisioned isolated preview environment. Production secrets were not copied into generic Preview. Browser QA also found a missing submit button type in the new note form; it was fixed and covered by a component regression test before release.
