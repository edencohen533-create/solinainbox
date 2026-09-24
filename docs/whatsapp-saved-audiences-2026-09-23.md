# Saved WhatsApp audiences — 2026-09-23–24

This extends `DistributionList` and `Campaign`; it does not introduce a second list/CRM/campaign system. Production Meta validation remains blocked by the missing live account and approved test recipient.

## Behavior and semantics

- Lists can retain static members or a saved segment, never both. The existing CSV/manual-list paths remain available.
- A visual editor supports AND/OR groups (three group levels, 50 total predicates/groups maximum), tags including negative membership, custom fields, lead source, representative assigned to any conversation, consent, global block, current local marketing eligibility, last message/inbound/outbound date and previous campaign participation/result.
- Date comparisons use the latest message across all contact conversations/numbers. Before excludes contacts without a message; “never” explicitly selects them. Day entry is interpreted in the operator's browser timezone and stored as an absolute ISO timestamp. “After” includes the selected date.
- Representative conditions mean conversation assignment, not a separate contact ownership field. Campaign SENT means provider acceptance/send tracking, not proof of delivery or reading. Purchases, products, order dates and an independent CRM lead-stage field are not invented when absent.
- Preview performs real database counts for matches, exclusions, current eligibility and ineligibility, with five contact samples. Changing the input hides stale results, including late responses to an older query.
- Up to 20 existing lists/segments can be excluded from a campaign. Tenant ownership is checked for every referenced list, tag, representative and campaign, including negative predicates, before evaluation.
- Audience membership and exclusions are frozen when the campaign draft is created. The transaction uses repeatable-read isolation. Later list/segment edits do not silently change a scheduled campaign. Global blocks, opt-outs, template state, sender state and marketing frequency remain checked at dispatch.
- Excluded recipients are retained as SKIPPED with a reason. The campaign stores source-list criteria and a frozen exclusion count. Preflight shows this separately from the recipients still queued. Duplication re-evaluates today's audience/exclusions into a new draft.
- Draft creation refuses audiences above 10,000 matched contacts instead of silently truncating. CSV and recipient membership creation use database bulk inserts.

## Implementation

`src/lib/audiences.ts`: strict bounded schemas. `src/server/services/audience-service.ts`: parameterized Prisma predicates, reference authorization, counts and selection. `distribution-list-service.ts`: audited saves. `src/components/campaigns/audience-editor.tsx`: editor and preview. Existing campaign UI/services and list APIs are extended; preview uses `POST /api/distribution-lists/preview` with manager/admin authorization.

Migration `20260923144704_whatsapp_saved_audiences.sql` adds nullable segment JSON to lists and exclusion IDs/snapshot/count to campaigns. Existing rows remain static lists, with zero exclusions. No new table, browser grant or environment variable is needed; existing business RLS remains in force.

## Validation status

157 unit/component tests passed, as did TypeScript and lint. All 21 real PostgreSQL/API/worker tests in four files passed in 1355.01 seconds, including the actual 10,000-row import and 10,000-recipient draft. The bulk case took 72.914 seconds including several API/database assertions; it is not a single-request timing. The additive migration rehearsal passed and its probe transaction rolled back. The final production build also passed on 2026-09-24. Full browser QA and production rollout are pending. No live Meta acceptance is claimed.

New tests cover bounded predicates, foreign/negative references, late-preview races, real nested AND/OR/exclusions, frozen membership despite later edits, opt-out after activation, latest-message date semantics, previous campaign result selection, and a 10,000-row API import plus a 10,000-recipient draft in isolated PostgreSQL without activating that bulk campaign. The older 10,000-recipient worker test uses a mocked database/provider and is not a live throughput benchmark.
