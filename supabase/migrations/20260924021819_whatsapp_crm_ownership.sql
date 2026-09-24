-- Existing contacts retain an unknown stage; only future inserts default to NEW.
ALTER TABLE "Contact" ADD COLUMN "ownerId" TEXT, ADD COLUMN "leadStage" TEXT;
ALTER TABLE "Contact" ALTER COLUMN "leadStage" SET DEFAULT 'NEW';
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_owner_organization_fk" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "User"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_leadStage_check" CHECK ("leadStage" IN ('NEW','CONTACTED','QUALIFIED','CUSTOMER','LOST'));
CREATE INDEX "Contact_organizationId_ownerId_idx" ON "Contact"("organizationId", "ownerId");
CREATE INDEX "Contact_ownerId_idx" ON "Contact"("ownerId");
CREATE INDEX "Contact_organizationId_leadStage_idx" ON "Contact"("organizationId", "leadStage");
