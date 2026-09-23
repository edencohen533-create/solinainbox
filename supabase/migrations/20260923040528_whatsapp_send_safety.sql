-- Additive migration. Existing historical messages are deliberately not reclassified.
ALTER TYPE public."MessageStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE public."MessageStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';
ALTER TABLE public."Contact"
 ADD COLUMN IF NOT EXISTS "isBlocked" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3),
 ADD COLUMN IF NOT EXISTS "consentSource" TEXT,
 ADD COLUMN IF NOT EXISTS "consentEvidence" TEXT,
 ADD COLUMN IF NOT EXISTS "consentScope" TEXT,
 ADD COLUMN IF NOT EXISTS "lastMarketingAt" TIMESTAMP(3);
ALTER TABLE public."Conversation"
 ADD COLUMN IF NOT EXISTS "sendLockToken" TEXT,
 ADD COLUMN IF NOT EXISTS "sendLockUntil" TIMESTAMP(3);
ALTER TABLE public."Message"
 ADD COLUMN IF NOT EXISTS "requestKey" TEXT,
 ADD COLUMN IF NOT EXISTS "providerCredentialId" TEXT,
 ADD COLUMN IF NOT EXISTS "errorReason" TEXT,
 ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
 ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
 ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Message_requestKey_key" ON public."Message"("requestKey");
ALTER TABLE public."Campaign"
 ADD COLUMN IF NOT EXISTS "senderSnapshot" TEXT,
 ADD COLUMN IF NOT EXISTS "templateSnapshot" TEXT;
ALTER TABLE public."ProviderCredential"
 ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3),
 ADD COLUMN IF NOT EXISTS "lastConnectionError" TEXT,
 ADD COLUMN IF NOT EXISTS "sendingBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public."Template" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
-- Fail closed for old campaigns without an auditable sender/template snapshot.
UPDATE public."Campaign" SET status='PAUSED' WHERE status IN ('SCHEDULED','RUNNING');
-- No new public tables or grants; existing RLS and revoked grants stay in force.
