-- Additive rollout: existing deployment remains compatible until sender-aware code is promoted.
-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "providerCredentialId" TEXT;

-- AlterTable
ALTER TABLE "ProviderCredential" ADD COLUMN     "displayPhoneNumber" TEXT,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "providerCredentialId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_providerCredentialId_idx" ON "Conversation"("providerCredentialId");

-- CreateIndex
CREATE INDEX "Campaign_providerCredentialId_idx" ON "Campaign"("providerCredentialId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_providerCredentialId_fkey" FOREIGN KEY ("providerCredentialId") REFERENCES "ProviderCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_providerCredentialId_fkey" FOREIGN KEY ("providerCredentialId") REFERENCES "ProviderCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Bind only provable history. Ambiguous/unattributed threads stay unbound and fail closed for live sends.
UPDATE "Conversation" c SET "providerCredentialId" = h.sender
FROM (SELECT "conversationId", min("providerCredentialId") AS sender FROM "Message"
      WHERE "providerCredentialId" IS NOT NULL GROUP BY "conversationId"
      HAVING count(DISTINCT "providerCredentialId") = 1) h
WHERE c.id = h."conversationId";
UPDATE "Campaign" c SET "providerCredentialId" = p.id
FROM "ProviderCredential" p
WHERE c."organizationId" = p."organizationId" AND split_part(c."senderSnapshot", ':', 1) = p.id;
WITH chosen AS (SELECT DISTINCT ON ("organizationId") id FROM "ProviderCredential" WHERE "isActive" ORDER BY "organizationId", "createdAt", id)
UPDATE "ProviderCredential" p SET "isDefault" = true FROM chosen WHERE p.id = chosen.id;

-- Enforce same-business relationships even on direct SQL writes.
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_providerCredentialId_organization_fk" FOREIGN KEY ("organizationId", "providerCredentialId") REFERENCES "ProviderCredential"("organizationId", "id") ON DELETE NO ACTION;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_providerCredentialId_organization_fk" FOREIGN KEY ("organizationId", "providerCredentialId") REFERENCES "ProviderCredential"("organizationId", "id") ON DELETE NO ACTION;
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_teamId_organization_fk" FOREIGN KEY ("organizationId", "teamId") REFERENCES "Team"("organizationId", "id") ON DELETE NO ACTION;
CREATE UNIQUE INDEX "ProviderCredential_one_active_default" ON "ProviderCredential"("organizationId") WHERE "isActive" AND "isDefault";
