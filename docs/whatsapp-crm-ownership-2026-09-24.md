# CRM ownership and lead stages — 24 September 2026

Scope: finish the current ownership phase, deploy it, then stop at the user's request. This is not completion of the entire WhatsApp specification.

## Behavior

Contacts now have an independent CRM owner and a nullable lead stage (NEW, CONTACTED, QUALIFIED, CUSTOMER, LOST). Managers/admins can assign an active user in the same organization. Agents can update visible lead stages but cannot transfer ownership. Ownership gives contact access without granting access to another agent's conversation. Existing conversation assignments remain unchanged.

The customer card edits and displays these fields; permitted CSV exports include them. Saved audiences support owner/stage predicates with AND/OR and null-safe exclusions. Internal stages do not imply external CRM synchronization. Automatic routing, custom pipelines, bulk ownership import and ownership history UI are outside this phase; changes are recorded in audit logs.

Migration `20260924021819_whatsapp_crm_ownership.sql` adds columns, indexes, a stage constraint and both ordinary and organization-composite owner foreign keys. Existing records retain NULL owner/stage. Only future inserts default to NEW. No messages are sent by this feature.

## Evidence

- Migration rehearsal rolled back successfully, then applied only to isolated QA before production.
- `tests/qa/crm-ownership.test.ts`: 3 passed, 88.60 seconds; real isolated PostgreSQL/API tests of agent permissions, foreign owner rejection, database FK enforcement, conversation isolation, audit writes, audience counts and NULL exclusions.
- Existing unit/component suite: 161 passed across 37 files. Lint and Next build/typecheck passed.
- Production migration preserved 262 contacts and 459 messages; all existing ownership/stage values remained NULL. Contact RLS enabled, anon SELECT denied. Supabase security advisor: zero findings.
- Focused mobile browser passed: owner/stage saved and persisted on refresh, no horizontal overflow, service conversation and task create/complete regression passed, zero outbound messages. Screenshot: `qa/screenshots/crm-ownership-mobile.png`.
- Candidate authenticated/read-only smoke passed for pages, APIs, conversation/task snapshots and unauthenticated access guards. No live Meta traffic or customer campaigns were used.

## Remaining work / stop handoff

The 199-row matrix now has 86 implemented/tested, 90 partial, 13 missing and 10 blocked requirements. Tests may use mocks or an isolated database; this is not live provider certification. See `qa/whatsapp-requirements-matrix.csv` for every requirement, priority and evidence.

Highest priority remaining work:

1. Live Meta onboarding/permissions/quality checks and approved test-number sending; prove an actual campaign and inbound/reply path. No active Meta credential/test device is available. Default seeded production passwords must be replaced before Meta activation.
2. Complete media/button templates and campaign attachments, missing-field defaults and approved test-send allowlist.
3. Retry/backoff and controlled recipient retry, including unresolved provider outcomes without blind duplicate sending.
4. Multistep automations, delay/branch orchestration, expanded triggers (CRM stages/tasks/purchases where available), versioning and run-history gaps.
5. Contact merge that preserves conversations, campaign/task links, consent and audit history.
6. Remaining partial inbox, scheduling, CSV and operational UX requirements in the matrix; no assertion that existing screens fully satisfy them.
7. Campaign response/opt-out attribution, clicks, response-time reporting and reliable cost data. Revenue/conversions/purchase segments require an external source and attribution policy.
8. Retention/deletion policy and implementation require a business decision.

Production candidate: https://solinainbox-bmbqem43e-edencohen533-9754s-projects.vercel.app
