# Supabase public-table exposure remediation

Project: `eeumuofgxiozcgzrveof` (Solina Inbox). Applied on 2026-09-23.

The Supabase security advisor confirmed 18 `rls_disabled_in_public` errors.
All 18 application tables had anon/authenticated Data API grants; RLS was disabled.
The application uses NextAuth and server-side Prisma as postgres; browser clients
use Supabase only for realtime broadcasts, not direct table CRUD.

Applied `prisma/changes/security-baseline.sql` to the live database:
- Enable RLS on existing public application tables owned by postgres.
- Revoke all table and sequence access from anon, authenticated and PUBLIC.
- Remove their default table/sequence privileges for new postgres-owned objects.
- Preserve the privileged server connection; no user records were deleted/changed.

Verification:
- 18 public tables; 0 without RLS; 0 with browser read/write/delete grants.
- Server-role read checks still return the existing records.
- Actual SET ROLE checks deny anon reads/updates/deletes and authenticated reads
  of User and ProviderCredential, in a rolled-back transaction.
- A fresh Supabase security advisor run reports no ERROR/WARN findings.
- The remaining 18 `rls_enabled_no_policy` INFO entries are intentional: browser
  Data API access is denied; application access goes through the server role.

This closes the reported Data API exposure. It does not prove whether historical
unauthorized access occurred. Realtime content and application-route permissions
are separate controls addressed in the accompanying code changes; those changes
need to be deployed to affect the running application.

HTTP verification also passed: public requests to User, Contact, Message and
ProviderCredential return 401 with PostgreSQL error code 42501 (permission denied),
using the configured anon key. This confirms actual access denial, rather than
an expired/invalid API credential producing a misleading authentication failure.
