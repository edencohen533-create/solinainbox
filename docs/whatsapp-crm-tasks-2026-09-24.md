# CRM tasks and service eligibility — 2026-09-24

The existing customer card and inbox now expose the same internal follow-up tasks: title, representative, due time, OPEN/DONE/CANCELLED state and completion time. Task lists load on demand, paginate at 50 items, retain failed form input, and display dates in the browser timezone. They do not send messages or create reminders outside the application. Representatives see their own tasks only while they can still access the customer/conversation; managers can manage their business's tasks. An assignee must have access to the linked customer and conversation.

Creation uses a persisted request UUID and a contact lock to prevent duplicate tasks from double clicks or uncertain HTTP responses. Updates use an expected version to prevent one representative overwriting another's changes. Creation and changes write audit records in the same transaction. Conversation/contact consistency and business references are enforced in PostgreSQL as well as the API.

Opening/assigning a conversation no longer rejects a contact solely because they opted out of marketing. Opening does not send anything. The existing outbound service still permits eligible service replies inside the inbound window and blocks marketing, expired-window replies without eligibility, and globally blocked contacts.

Migration `20260924015504_whatsapp_crm_tasks.sql` adds `ContactTask` with RLS, no browser grants, nine foreign keys and indexed business/contact/assignee access. `scripts/organization-security.sql` mirrors these safeguards for fresh installations. Existing messages/contacts are not rewritten. No new environment variable or external service is required.

Validation so far: 161 unit/component tests in 37 files, lint, TypeScript and production build passed. Three isolated PostgreSQL/API tests passed in 132.10 seconds: concurrent creation, stale edit, audit records, agent/foreign-business denial, direct cross-contact/cross-business FK rejection, and opted-out service versus marketing/window policy. A migration rehearsal verified permissions/constraints and rolled back, then the migration was applied in QA. Browser QA is pending. No real Meta messages were sent.

Production migration applied 2026-09-24. Counts stayed at 262 contacts and 459 messages, with zero tasks. The new table has RLS enabled, anonymous read/authenticated write denied, and nine foreign keys. Supabase security advisor returned no findings. Application deployment is pending.

Tasks are currently manual follow-up records. Due-task automation triggers, automatic reminder delivery and a cross-customer task dashboard remain gaps; this change does not claim those features. Contact merge and independent CRM lead ownership/stages also remain separate matrix gaps.
