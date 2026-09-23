-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "ContactCustomField" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "MessageAttachment" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "ContactTag" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "ConversationTag" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "ConversationDraft" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "CannedReply" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "ProviderCredential" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy'),
ADD COLUMN     "phoneNumberId" TEXT;

-- AlterTable
ALTER TABLE "DistributionList" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "DistributionListMember" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT COALESCE(NULLIF(current_setting('solina.organization_id', true), ''), 'legacy');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCampaignScanAt" TIMESTAMP(3),
    "lastAutomationScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");

-- CreateIndex
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");

-- CreateIndex
CREATE INDEX "ContactCustomField_organizationId_idx" ON "ContactCustomField"("organizationId");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_idx" ON "Conversation"("organizationId");

-- CreateIndex
CREATE INDEX "Message_organizationId_idx" ON "Message"("organizationId");

-- CreateIndex
CREATE INDEX "MessageAttachment_organizationId_idx" ON "MessageAttachment"("organizationId");

-- CreateIndex
CREATE INDEX "Tag_organizationId_idx" ON "Tag"("organizationId");

-- CreateIndex
CREATE INDEX "ContactTag_organizationId_idx" ON "ContactTag"("organizationId");

-- CreateIndex
CREATE INDEX "ConversationTag_organizationId_idx" ON "ConversationTag"("organizationId");

-- CreateIndex
CREATE INDEX "Note_organizationId_idx" ON "Note"("organizationId");

-- CreateIndex
CREATE INDEX "ConversationDraft_organizationId_idx" ON "ConversationDraft"("organizationId");

-- CreateIndex
CREATE INDEX "CannedReply_organizationId_idx" ON "CannedReply"("organizationId");

-- CreateIndex
CREATE INDEX "Template_organizationId_idx" ON "Template"("organizationId");

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_idx" ON "AutomationRule"("organizationId");

-- CreateIndex
CREATE INDEX "AutomationRun_organizationId_idx" ON "AutomationRun"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_phoneNumberId_key" ON "ProviderCredential"("phoneNumberId");

-- CreateIndex
CREATE INDEX "ProviderCredential_organizationId_idx" ON "ProviderCredential"("organizationId");

-- CreateIndex
CREATE INDEX "DistributionList_organizationId_idx" ON "DistributionList"("organizationId");

-- CreateIndex
CREATE INDEX "DistributionListMember_organizationId_idx" ON "DistributionListMember"("organizationId");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_organizationId_idx" ON "CampaignRecipient"("organizationId");

-- Organization enforcement beyond Prisma's schema language. Keep these constraints when regenerating schema.
INSERT INTO "Organization" ("id", "name") VALUES ('legacy', 'Solina') ON CONFLICT ("id") DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solina_runtime') THEN
    CREATE ROLE solina_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT solina_runtime TO postgres;
GRANT USAGE ON SCHEMA public TO solina_runtime;
UPDATE "ProviderCredential" SET "phoneNumberId" = "config"->>'phoneNumberId' WHERE "provider" = 'meta_whatsapp_cloud_api';

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "User" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "User" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "User" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "User" ADD CONSTRAINT "User_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "User_organizationId_id_key" ON "User"("organizationId", "id");
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Team" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Team" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Team" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Team" ADD CONSTRAINT "Team_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Team_organizationId_id_key" ON "Team"("organizationId", "id");
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Contact" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Contact" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Contact" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Contact_organizationId_id_key" ON "Contact"("organizationId", "id");
ALTER TABLE "ContactCustomField" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ContactCustomField" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ContactCustomField" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "ContactCustomField" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "ContactCustomField_organizationId_id_key" ON "ContactCustomField"("organizationId", "id");
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Conversation" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Conversation" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Conversation" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Conversation_organizationId_id_key" ON "Conversation"("organizationId", "id");
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Message" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Message" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Message" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Message" ADD CONSTRAINT "Message_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Message_organizationId_id_key" ON "Message"("organizationId", "id");
ALTER TABLE "MessageAttachment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MessageAttachment" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "MessageAttachment" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "MessageAttachment" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "MessageAttachment_organizationId_id_key" ON "MessageAttachment"("organizationId", "id");
ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Tag" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Tag" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Tag" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Tag_organizationId_id_key" ON "Tag"("organizationId", "id");
ALTER TABLE "ContactTag" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ContactTag" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ContactTag" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "ContactTag" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConversationTag" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ConversationTag" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ConversationTag" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "ConversationTag" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Note" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Note" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Note" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Note" ADD CONSTRAINT "Note_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Note_organizationId_id_key" ON "Note"("organizationId", "id");
ALTER TABLE "ConversationDraft" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ConversationDraft" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ConversationDraft" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "ConversationDraft" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "ConversationDraft" ADD CONSTRAINT "ConversationDraft_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "ConversationDraft_organizationId_id_key" ON "ConversationDraft"("organizationId", "id");
ALTER TABLE "CannedReply" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CannedReply" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "CannedReply" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "CannedReply" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "CannedReply" ADD CONSTRAINT "CannedReply_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "CannedReply_organizationId_id_key" ON "CannedReply"("organizationId", "id");
ALTER TABLE "Template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Template" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Template" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Template" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Template" ADD CONSTRAINT "Template_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Template_organizationId_id_key" ON "Template"("organizationId", "id");
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AutomationRule" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AutomationRule" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "AutomationRule" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "AutomationRule_organizationId_id_key" ON "AutomationRule"("organizationId", "id");
ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AutomationRun" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AutomationRun" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "AutomationRun" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "AutomationRun_organizationId_id_key" ON "AutomationRun"("organizationId", "id");
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AuditLog" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AuditLog" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "AuditLog" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "AuditLog_organizationId_id_key" ON "AuditLog"("organizationId", "id");
ALTER TABLE "ProviderCredential" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProviderCredential" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ProviderCredential" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "ProviderCredential" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "ProviderCredential_organizationId_id_key" ON "ProviderCredential"("organizationId", "id");
ALTER TABLE "DistributionList" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DistributionList" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "DistributionList" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "DistributionList" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "DistributionList" ADD CONSTRAINT "DistributionList_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "DistributionList_organizationId_id_key" ON "DistributionList"("organizationId", "id");
ALTER TABLE "DistributionListMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DistributionListMember" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "DistributionListMember" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "DistributionListMember" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "DistributionListMember" ADD CONSTRAINT "DistributionListMember_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Campaign" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Campaign" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Campaign" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Campaign_organizationId_id_key" ON "Campaign"("organizationId", "id");
ALTER TABLE "CampaignRecipient" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CampaignRecipient" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "CampaignRecipient" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "CampaignRecipient" FOR ALL TO solina_runtime USING ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("organizationId" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "CampaignRecipient_organizationId_id_key" ON "CampaignRecipient"("organizationId", "id");
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Organization" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Organization" TO solina_runtime;
CREATE POLICY "organization_isolation" ON "Organization" FOR ALL TO solina_runtime USING ("id" = (SELECT NULLIF(current_setting('solina.organization_id', true), ''))) WITH CHECK ("id" = (SELECT NULLIF(current_setting('solina.organization_id', true), '')));
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_organization_fk" FOREIGN KEY ("organizationId", "teamId") REFERENCES "Team"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_contactId_organization_fk" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_organization_fk" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedAgentId_organization_fk" FOREIGN KEY ("organizationId", "assignedAgentId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_organization_fk" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "Conversation"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentByUserId_organization_fk" FOREIGN KEY ("organizationId", "sentByUserId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_organization_fk" FOREIGN KEY ("organizationId", "templateId") REFERENCES "Template"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_organization_fk" FOREIGN KEY ("organizationId", "messageId") REFERENCES "Message"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_organization_fk" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_organization_fk" FOREIGN KEY ("organizationId", "tagId") REFERENCES "Tag"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_conversationId_organization_fk" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "Conversation"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_tagId_organization_fk" FOREIGN KEY ("organizationId", "tagId") REFERENCES "Tag"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Note" ADD CONSTRAINT "Note_conversationId_organization_fk" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "Conversation"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Note" ADD CONSTRAINT "Note_contactId_organization_fk" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_organization_fk" FOREIGN KEY ("organizationId", "authorId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ConversationDraft" ADD CONSTRAINT "ConversationDraft_conversationId_organization_fk" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "Conversation"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ConversationDraft" ADD CONSTRAINT "ConversationDraft_userId_organization_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "CannedReply" ADD CONSTRAINT "CannedReply_createdByUserId_organization_fk" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_organization_fk" FOREIGN KEY ("organizationId", "ruleId") REFERENCES "AutomationRule"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_conversationId_organization_fk" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "Conversation"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_organization_fk" FOREIGN KEY ("organizationId", "actorUserId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_conversationId_organization_fk" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "Conversation"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "DistributionListMember" ADD CONSTRAINT "DistributionListMember_listId_organization_fk" FOREIGN KEY ("organizationId", "listId") REFERENCES "DistributionList"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "DistributionListMember" ADD CONSTRAINT "DistributionListMember_contactId_organization_fk" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_listId_organization_fk" FOREIGN KEY ("organizationId", "listId") REFERENCES "DistributionList"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_organization_fk" FOREIGN KEY ("organizationId", "templateId") REFERENCES "Template"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_organization_fk" FOREIGN KEY ("organizationId", "createdById") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_organization_fk" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_organization_fk" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Message" ADD CONSTRAINT "Message_providerCredentialId_organization_fk" FOREIGN KEY ("organizationId", "providerCredentialId") REFERENCES "ProviderCredential"("organizationId", "id") ON DELETE NO ACTION;

-- Additive cutover: retain legacy global keys until every worker runs scoped lookups.
CREATE UNIQUE INDEX "Contact_organizationId_phone_key" ON "Contact"("organizationId", "phone");
CREATE UNIQUE INDEX "Tag_organizationId_name_key" ON "Tag"("organizationId", "name");
CREATE UNIQUE INDEX "CannedReply_organizationId_shortcut_key" ON "CannedReply"("organizationId", "shortcut");
CREATE UNIQUE INDEX "Template_organizationId_name_language_key" ON "Template"("organizationId", "name", "language");
