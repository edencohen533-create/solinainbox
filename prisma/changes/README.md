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
