-- DropIndex
DROP INDEX "Template_name_key";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "inboundKey" TEXT;

-- AlterTable
ALTER TABLE "MessageAttachment" ADD COLUMN     "providerMediaId" TEXT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "providerAccountId" TEXT,
ADD COLUMN     "providerTemplateId" TEXT,
ADD COLUMN     "syncError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_inboundKey_key" ON "Message"("inboundKey");

-- CreateIndex
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_providerTemplateId_key" ON "Template"("providerTemplateId");

-- CreateIndex
CREATE INDEX "Template_providerAccountId_idx" ON "Template"("providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_language_key" ON "Template"("name", "language");
