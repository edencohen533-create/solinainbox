# Meta readiness QA — 23 September 2026

## Scope and evidence

QA uses synthetic users, contacts and messages in `solina_qa_20260923`, a separate, non-public PostgreSQL schema. Meta HTTP responses are simulated during integration tests; browser delivery uses the mock provider. No customer messages were sent and no live Meta credentials were configured.

Verified service workflows on real PostgreSQL (five integration scenarios):

- Concurrent starts create one conversation. A representative cannot read another representative's conversation/contact, claim that conversation, or start a competing thread.
- Template submission persists pending approval, includes example values for Meta, and cannot be sent while pending. Synchronizing an approved status enables template delivery outside the service window.
- Duplicate inbound webhooks create one message and one unread increment. A customer reply opens the service window. Outbound text requests and read/delivered callbacks update persistent state without downgrading status.
- Campaign membership is snapshotted. Future scheduling and pause prevent dispatch; resume works. Two concurrent workers send each consenting recipient once. Unknown consent and opt-outs are skipped.
- A returning customer retains the active representative from the previous conversation. An inbound STOP/הסר blocks subsequent sends.

The initial database run exposed transaction expiry under network latency. Prisma interactive transactions now have bounded 20-second timeouts and a 10-second acquisition limit; the complete database suite passed after the fix.

## Changes resulting from QA

- Added text-template submission to Meta from the templates screen (Marketing/Utility, positional variables and review examples). Templates remain unavailable until approved. Interrupted submissions are retained for reconciliation through synchronization, without automatic resubmission.
- Added contact-to-conversation initiation and representative display in the contacts list. Assignment survives closed conversations and returning inbound contacts; inactive representatives cannot be assigned through automation.
- Scoped contact reads, updates and related conversation/note history to representative permissions. Restricted automation management/history to managers/admins and hid unavailable account-management controls.
- Added read-only Meta connection diagnostics, number-to-WABA ownership validation and required WABA configuration. Provider switching is atomic. Diagnostics report whether an app subscription exists, but cannot prove it is the intended app.
- Disabled demo inbound simulation whenever a real provider is active.
- Added password changes, session invalidation after account updates, self-deactivation protection, and a Meta activation gate for active accounts using the published demo password. Existing production credentials were not changed.
- Added contact consent management; inbound opt-out remains authoritative for subsequent sends.
- Fixed form-label associations, responsive navigation, inbox layout, page scrolling and global conversation search.
- Treat Meta success responses without a message ID as uncertain outcomes, never as confirmed success.
- Added a targeted `deepmerge-ts@8.0.0` override for Prisma configuration tooling. Prisma generation and type checking passed with the override. The advisory concerns recursive object graphs; the patched release supports them. Sources: [maintainer release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0), [advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

## Repeatable checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build -- --webpack
npm audit
node scripts/qa-environment.cjs setup
npm run test:qa
node scripts/qa-environment.cjs start  # separate terminal; localhost:3101
npm run test:browser
# Stop the QA server, then remove only the synthetic schema:
node scripts/qa-environment.cjs cleanup
```

The setup refuses to overwrite an existing QA schema. Integration tests reset only specified QA tables, and refuse to run against `public`. Browser QA is fixed to localhost:3101. Playwright Chromium must be installed (`npx playwright install chromium`). Browser screenshots are stored in `/tmp/solina-qa-browser`.

Supabase advisors reported no ERROR/WARN findings. The 22 INFO notices for RLS without browser policies are intentional: only privileged server-side Prisma accesses business data. [Explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Required real-account acceptance test

The installation is still in mock mode. A release can pass software QA without proving Meta account approval, token permissions, number registration or actual handset delivery. Before treating it as live-ready:

1. In team settings, replace passwords for accounts that will be used and deactivate remaining demo accounts. Create named staff accounts with the appropriate roles.
2. Enter the Phone Number ID, WABA ID, permanent token with `whatsapp_business_messaging` and `whatsapp_business_management`, App Secret and webhook verify token. Save and run the connection diagnostic.
3. In Meta, verify the production webhook `https://solinainbox.vercel.app/api/webhooks/whatsapp`, subscribe to `messages`, and ensure the intended app is subscribed to the WABA. Complete any account/number verification, billing and app access requirements shown by Meta.
4. Submit a test text template in the software, wait for Meta approval, then synchronize. Confirm pending/rejected templates cannot be selected for delivery.
5. From an opted-in test handset, send an inbound message. Confirm its conversation and representative, reply from that representative's account, and verify delivery/read statuses on the handset and software. Verify another representative is denied access.
6. Send one approved template outside the service window. Test image/document upload and inbound attachments. Uploaded files are limited to 4MB; downloads to 20MB and Meta retention.
7. Run a campaign to a tiny test-only opted-in list, observe cron delivery and per-recipient status, then test pause/cancel and opt-out.

No live Meta account acceptance test has been completed. Rich/media-header templates, authentication templates, template editing and automated retries of uncertain sends are not implemented. Initial submission supports text bodies; sync also supports static footers. Campaign processing is bounded to 20 recipients per minute invocation (possibly fewer under latency), not a high-throughput bulk engine. This deployment is a single-organization workspace.

Meta API contract was checked against [Meta's template example](https://github.com/fbsamples/whatsapp-api-examples/tree/main/message-templates-js/complete-app). The example's old Graph version was not adopted.
