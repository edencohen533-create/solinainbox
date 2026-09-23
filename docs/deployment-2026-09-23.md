# Production deployment — 2026-09-23

Production URL: https://solinainbox.vercel.app

Deployment: `dpl_6mZT3X6yvRiw8Fj5y1DKEa4S58x5`
Immutable URL: https://solinainbox-ms24zqddv-edencohen533-9754s-projects.vercel.app
Runtime source commit: `fcc4cb8` (later commits only add deployment documentation/check tooling).

Applied `campaigns.sql` and `inbox-reliability.sql` atomically to project
`eeumuofgxiozcgzrveof`. All 22 public application tables have RLS enabled and
zero anon/authenticated read/write/delete grants. Existing contact/message counts
were unchanged (262 contacts, 459 messages at verification).

Vercel production build passed with Turbopack after making Prisma generation an
explicit build step. `.vercelignore` excludes local environment and build files.
Production environment already had CRON_SECRET and all database/auth/realtime
variables configured. Cron configuration includes campaigns every minute and
automations every two minutes.

Promoted the tested production candidate to the primary domain. Authenticated
read-only smoke checks cover login, inbox, campaigns, templates, WhatsApp settings,
distribution-list APIs and authorized message snapshots; unauthenticated campaign
and cron requests are denied. No WhatsApp messages or business records were created
by the smoke tests. Run `scripts/smoke-deployment.cjs` with SMOKE_TEST_EMAIL and
SMOKE_TEST_PASSWORD to repeat authenticated checks, or without them for public checks.

No live Meta provider is configured. The deployed application remains in mock mode
until the operator connects Meta credentials, a business account and real templates.
