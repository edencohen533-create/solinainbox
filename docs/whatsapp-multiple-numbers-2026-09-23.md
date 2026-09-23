# WhatsApp numbers and teams — 2026-09-23

This extends the existing official Meta Cloud API integration. It does not replace it or add a parallel inbox. Live Meta acceptance remains blocked: production has no Meta credential and no approved QA recipient was provided. No real customer messages were sent.

## Behavior

- A business can keep several active numbers from the same WABA. Connecting another active WABA is rejected explicitly; templates retain their existing business/name/language identity.
- Each conversation and campaign stores its own sender credential. Changing the default affects new work only. Campaign preflight and workers compare the selected sender snapshot, independently of the default.
- Inbound webhooks route by phone ID and signature to the business and then the correct number-specific conversation. A single contact can have separate threads for different numbers; marketing consent and frequency limits remain contact-wide.
- An administrator can label numbers, choose a default, assign a team, disconnect or reverify/reconnect each number. History is retained. Attachments use the original message/number credential even after disconnect, subject to Meta token validity and media availability.
- The inbox can filter by number and shows the sender. New conversations and campaign drafts offer sender selection. Disconnected/blocked senders disable sending while preserving drafts; polling refreshes the blocked state.
- Agent visibility requires both conversation assignment eligibility and number-team eligibility. Managers/admins remain business-wide. Direct send and assignment services also enforce these rules. Moving a number or agent to another team releases incompatible assignments without changing message authors.
- Administrators can create teams and change user team membership in existing user settings. Membership updates invalidate prior sessions. Team creation, membership, number changes and assignment are audited.
- A failed connection check blocks that number until explicit verified reconnect. The UI distinguishes saved configuration, last read-only Graph verification and last authenticated webhook; none is presented as proof of live end-to-end delivery.

## Schema and rollout

`supabase/migrations/20260923122849_whatsapp_multiple_numbers.sql` adds nullable sender references, number labels/display number/team/default/webhook timestamp, three same-business composite foreign keys and a partial unique index allowing at most one active default per business.

Migration history binding uses actual message credential IDs only if unambiguous, and existing campaign sender snapshots. Demo and ambiguous history stays unbound, never silently converted to live traffic. Production preflight found 262 contacts, 459 messages, zero credentials and zero campaigns. The rollout is additive and compatible with the previous deployment during promotion.

Fresh installations must apply `scripts/organization-security.sql` after schema creation; it includes RLS/runtime grants and the added composite constraints/default index. Existing installations use versioned migrations.

## Evidence

- 152 tests in 32 unit/integration files passed; TypeScript, ESLint and webpack production build passed.
- All 17 real PostgreSQL/API/worker tests in 3 files passed in 1030.42 seconds. Graph HTTP is mocked; database constraints, tenant runtime role, leases and service calls are real.
- `tests/unit/sender-pinning.test.ts`: pinned sender fail-closed, demo/live separation, original credential for historical media, stable fingerprint on default/team/label edits, team-scoped sender choices without secrets.
- `tests/qa/multiple-numbers.test.ts`: real isolated PostgreSQL + mocked Graph requests for two numbers, same-contact thread separation, direct agent denials, campaign pinning, default change, disconnect/reconnect, team transfer and WABA/default constraints.
- `scripts/qa-number-migration.cjs`: cloned QA tables transformed to old schema, synthetic unambiguous/ambiguous/demo history, real migration applied and assertions checked inside a transaction that is deliberately rolled back. Passed; probe schema absent afterward.
- Browser suite includes team creation/membership and agent permission denials as well as the existing inbox, CRM, campaign preflight, CSV and mobile flows. No live Graph requests are allowed in QA.

## Remaining limits and dependencies

This increment does not complete advanced segments, multi-step automation, media/button template authoring, provider-aware retries/quiet hours, external CRM adapters or business cost attribution. These remain explicitly tracked in the 199-row requirements matrix. Multi-number UI alone does not establish Meta readiness.

Operator setup: replace/disable accounts using seed passwords; connect verified phone IDs belonging to the same WABA with valid server-side token, app secret and verification token; subscribe the correct Meta app; select teams/default number; sync approved templates; then run a signed inbound + reply and a template campaign only to an approved test recipient. Live campaign and two-way acceptance have not been performed.

Provider docs rechecked 2026-09-23: [official pricing page](https://whatsappbusiness.com/products/platform-pricing/) describes delivered-message pricing by market/category and a 24-hour inbound-reset service window. No rate table is hardcoded. The [technical pricing documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) returned HTTP 429; forthcoming pricing/rate-limit changes cannot be claimed verified from it. Connection remains Graph v21.0 unless configured otherwise; its current lifecycle and account-specific limits still need provider verification.
