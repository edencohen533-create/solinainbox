# Automation dry-run and activation safety — 2026-09-24

The existing rule builder now offers a read-only dry-run against one of the latest 50 conversations. It simulates the selected trigger and reports the action, text, configured delay and current local blockers. It does not execute the trigger or action, contact Meta, create runs/messages/notes/audits, or reserve marketing frequency. The response explicitly says provider acceptance is unverified and checks run again during actual delivery.

New rules default to inactive in the UI, with explicit opt-in activation. Creation and activation validate that referenced representatives, canned replies and approved templates belong to the current business; template variable mappings are validated too. Mutations write an audit record in the same transaction. Missing/foreign rule activation returns 404, malformed JSON returns 400. Existing rules retain their activation state.

Actual automated assignment now applies the same number-team restriction as manual assignment. An unavailable conversation or incompatible representative produces a recorded skip and leaves the conversation unassigned. This extends the existing action rather than introducing another automation engine.

Preview results disappear when input changes, including a late response to a previous input. The modal scrolls on mobile and network failures preserve form input.

No schema migration or new environment variables. Live Meta acceptance, multi-step workflows, arbitrary branches, tasks and purchase triggers remain outside this change and retain their gaps in the coverage matrix.

Validation: 160 unit/component tests in 36 files, lint and the production build passed. PostgreSQL tests exercise no-side-effect preview, handoff/opt-out blockers, forbidden references/roles, inactive rule creation with audit, rejected-template activation and actual assignment across teams. All three PostgreSQL tests passed in 111.64 seconds on the corrected test fixture (the first run used an invalid template status). Focused mobile browser QA passed, including a final rerun after correcting Hebrew select labels and title spacing. It verified inactive save, no message/note side effects, no horizontal overflow and no runtime errors. [Mobile evidence](qa/screenshots/automation-dry-run-mobile.png).

Production candidate: `https://solinainbox-pwg8niozn-edencohen533-9754s-projects.vercel.app` (`dpl_6vGpLMqe7zreJG9DaV9X1Q7i4gqG`). Final read-only smoke passed, including anonymous 403 and authenticated invalid-input 400 for the preview API. Promoted to https://solinainbox.vercel.app on 2026-09-24.
