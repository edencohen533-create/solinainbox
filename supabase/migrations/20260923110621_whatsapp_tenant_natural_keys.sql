-- Phase 2: run only AFTER deploying the organization-scoped application and draining old workers.
-- Phase 1 has already added replacement tenant-scoped unique indexes.
DROP INDEX "Contact_phone_key";
DROP INDEX "Tag_name_key";
DROP INDEX "CannedReply_shortcut_key";
DROP INDEX "Template_name_language_key";
