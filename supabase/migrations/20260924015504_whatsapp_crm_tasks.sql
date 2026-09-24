-- Additive CRM tasks; retain all existing contacts and message history.
CREATE UNIQUE INDEX "Conversation_organizationId_contactId_id_key" ON "Conversation"("organizationId", "contactId", "id");
CREATE TABLE "ContactTask" (
  "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy'),
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "conversationId" TEXT REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "assignedToId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 0,
  "requestKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ContactTask_status_check" CHECK ("status" IN ('OPEN', 'DONE', 'CANCELLED')),
  CONSTRAINT "ContactTask_title_check" CHECK (length(trim("title")) BETWEEN 1 AND 200),
  CONSTRAINT "ContactTask_version_check" CHECK ("version" >= 0)
);
CREATE UNIQUE INDEX "ContactTask_organizationId_id_key" ON "ContactTask"("organizationId", "id");
CREATE UNIQUE INDEX "ContactTask_organizationId_requestKey_key" ON "ContactTask"("organizationId", "requestKey");
CREATE INDEX "ContactTask_organizationId_contactId_conversationId_idx" ON "ContactTask"("organizationId", "contactId", "conversationId");
CREATE INDEX "ContactTask_organizationId_assignedToId_status_dueAt_idx" ON "ContactTask"("organizationId", "assignedToId", "status", "dueAt");
CREATE INDEX "ContactTask_organizationId_createdById_idx" ON "ContactTask"("organizationId", "createdById");
CREATE INDEX "ContactTask_contactId_idx" ON "ContactTask"("contactId");
CREATE INDEX "ContactTask_conversationId_idx" ON "ContactTask"("conversationId");
CREATE INDEX "ContactTask_assignedToId_idx" ON "ContactTask"("assignedToId");
CREATE INDEX "ContactTask_createdById_idx" ON "ContactTask"("createdById");
-- Security is installed in the same transaction as the new exposed table.
ALTER TABLE "ContactTask" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ContactTask" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ContactTask" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "ContactTask" FOR ALL TO solina_runtime
USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')))
WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "ContactTask" ADD CONSTRAINT "ContactTask_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ContactTask" ADD CONSTRAINT "ContactTask_contact_organization_fk" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ContactTask" ADD CONSTRAINT "ContactTask_conversation_contact_fk" FOREIGN KEY ("organizationId", "contactId", "conversationId") REFERENCES "Conversation"("organizationId", "contactId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ContactTask" ADD CONSTRAINT "ContactTask_assignee_organization_fk" FOREIGN KEY ("organizationId", "assignedToId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ContactTask" ADD CONSTRAINT "ContactTask_creator_organization_fk" FOREIGN KEY ("organizationId", "createdById") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
