# Additive schema upgrades

This repository originally used `prisma db push` and has no Prisma migration baseline.
`campaigns.sql` is generated from the previous and new Prisma schemas and adds only
four campaign/list tables, two enums, indexes and foreign keys. It enables RLS and
revokes browser Data API access on the new tables. NextAuth authorization is enforced
in the server routes; Prisma must use a privileged, server-only database role.

For an **existing installation**, apply once before deploying this branch:

```sh
npx prisma db execute --schema prisma/schema.prisma --file prisma/changes/campaigns.sql
npx prisma generate
```

For a **fresh installation**, run `prisma db push` as described in the root README,
then apply the RLS/grants statements at the bottom of `campaigns.sql` (the tables and
enums will already exist). Do not apply the entire additive script after `db push`.

Verify the schema and relational constraints without retaining fixtures:

```sh
node scripts/verify-campaign-schema.cjs
```

The verifier opens a transaction, applies the additive DDL only if `Campaign` does
not yet exist, checks RLS, foreign keys, recipient uniqueness and claim behavior,
and rolls everything back. It requires an existing admin, contact and approved
local template (for example from the demo seed). It never calls a provider.

## Inbox reliability and security follow-up

After `campaigns.sql`, apply `inbox-reliability.sql` before deploying the updated
code. It adds inbound idempotency keys, provider message indexes, attachment media
IDs and template-sync metadata. Template uniqueness changes from name alone to
(name, language). The updated seed script uses that composite key.

```sh
npx prisma db execute --schema prisma/schema.prisma --file prisma/changes/inbox-reliability.sql
npx prisma generate
```

`security-baseline.sql` is idempotent and was applied to the live Solina Inbox
database on 2026-09-23. For new installations, run it after `prisma db push`.
It enables RLS on postgres-owned public tables and removes browser Data API grants,
including default table and sequence grants for new objects. NextAuth + server
Prisma remain the authorized access path. See the security remediation report.
