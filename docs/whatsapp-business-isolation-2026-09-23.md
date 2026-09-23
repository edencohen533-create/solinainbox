# WhatsApp business isolation — 23 September 2026

This change extends the existing application and Cloud API integration. It does not establish a live Meta connection. Production currently has no stored Meta credentials. No customer messages are sent by this QA.

## Implementation

- Every business table carries `organizationId`; existing rows retain the `legacy` business. `Organization` controls activation and fair worker scheduling.
- Auth.js refreshes membership and business activation from PostgreSQL. All protected route handlers and data-reading server components establish an `AsyncLocalStorage.run` scope from that authenticated session, never a request parameter.
- Application queries execute in short transactions under `solina_runtime`, a role without `BYPASSRLS`. `SET LOCAL` context, role and schema search path reset on commit/rollback. Explicit schema selection also protects handwritten lock queries behind PgBouncer. Missing context fails closed. Outbound QUEUED records still commit before calling Meta; a request-wide transaction would break that guarantee and is deliberately not used.
- RLS covers SELECT/INSERT/UPDATE/DELETE. Composite foreign keys reject relations between businesses even when an attacker supplies another business's valid ID. Prisma's schema does not express all of these extra SQL constraints: preserve `scripts/organization-security.sql` when regenerating schemas.
- Privileged database access is restricted to authentication, signed-webhook routing, authenticated cron enumeration, and operator scripts. A source-boundary regression test guards that allowlist.
- Contacts, tag names, template name/language and saved-reply shortcuts are unique per business. User email remains globally unique; one user belongs to one business. An operator can provision another business using `scripts/provision-organization.cjs` and `ORGANIZATION_ADMIN_PASSWORD` (minimum 16 characters).
- Webhooks select credentials by globally unique Meta phone ID, validate all matching signatures before mutations, then enter the owning business context. Disconnected credentials remain available for delivery receipts; automatic transfer of a phone between businesses is prohibited.
- Realtime updates use the existing session-authenticated polling (5-second ticks, paused in hidden tabs), without public Supabase broadcasts/subscriptions. Even empty public invalidations could leak activity timing across businesses. A private push transport is not configured.
- Cron rotates active businesses by last scan and uses bounded batches/deadlines. A failure in one business is reported as a count without logging secrets and does not abort all other businesses.

## Deployment sequence

1. Apply `20260923110519_whatsapp_business_isolation.sql`. It adds columns, indexes, policies and constraints without removing existing keys, and preserves the old application during cutover.
2. Deploy the new application and verify authenticated read paths and unauthenticated access denial.
3. Drain old requests/workers, then apply `20260923120920_whatsapp_tenant_natural_keys.sql`. Only this step removes global natural-key indexes; the replacement composite indexes already exist.
4. Verify 23 public tables have RLS, public/anon/authenticated table grants are absent, and the current application uses `solina_runtime` for business queries.

Do not roll back the application to a version that uses global natural-key upserts after step 3. Restoring those indexes is only possible if data across businesses does not conflict. Prefer forward fixes. Backups and all historical records are retained; these migrations do not delete customer data.

## Verification status

- Unit/integration: 142 tests in 29 files passed.
- Real PostgreSQL + mocked Graph: 13 tests passed in 561.90 seconds. Five exercise business isolation and actual API handlers with authenticated session fixtures; eight exercise existing WhatsApp workflows. The first run exposed a PgBouncer search-path bug and a test-duration limit; transaction-local schema selection was fixed and the complete suite passed on rerun. No failed run is counted as successful evidence.
- Browser operations: ADMIN/AGENT login, representative assignment and access denial, internal notes, CRM edits/export permissions, 205-message pagination/scroll anchoring, campaign preflight, draft duplication and automation stop passed. The deployment smoke suite also passed against the local production build. Meta requests in the database suite were mocked; the focused browser run did not send WhatsApp messages.
- The two migrations were exercised against a clone of the previous production table/index structure inside a transaction, with a synthetic pre-migration contact. Assertions covered legacy backfill, 23 RLS tables and duplicate phone numbers in separate businesses after phase 2. The entire probe was rolled back and its schema was confirmed absent.
- Phase 1 is applied in production: 23/23 tables have RLS and business policies, zero table grants to public/anon/authenticated, 262 contacts and 459 messages retained. Application deployment and phase 2 are complete. Production candidate `dpl_9ZnSYeVNn9vvBHm4xJHVrU16KV43` (commit `ecaad9a`) passed authenticated smoke and was promoted to https://solinainbox.vercel.app. The primary URL passed the same read-only checks. Runtime-role assertions in production proved that another/missing business context sees zero contacts; these checks were rolled back. Supabase security advisors returned no findings.
- Migration filenames are synchronized with the actual Supabase migration-history versions, including the earlier send-safety migration; SQL content of that earlier migration is unchanged.

New suites: `tests/unit/organization-boundary.test.ts`, `tests/unit/organization-webhook.test.ts`, `tests/qa/organization-isolation.test.ts`. Existing Meta workflow QA runs under the same runtime role with real isolated PostgreSQL and mocked Graph requests.

## Remaining platform scope

This foundation does not by itself complete multi-number routing inside a business, advanced segments, multi-step workflows, third-party CRM adapters, media/button templates, or live Meta acceptance. The requirement matrix must continue to identify those gaps explicitly. Businesses do not have a self-service signup or cross-business membership UI in this change.

## Sources

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): table owners and bypass roles are not constrained like ordinary roles; explicit policies are required.
- [PostgreSQL SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html): transaction-local role changes reset after the transaction.
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): RLS does not protect TRUNCATE/REFERENCES; runtime receives only DML grants. Composite foreign keys separately protect relationship integrity.
