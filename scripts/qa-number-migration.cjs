/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
require('./qa-environment.cjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const rollback = new Error('verified rollback');
const filename = fs.readdirSync('supabase/migrations').find((name) => name.endsWith('_whatsapp_multiple_numbers.sql'));
const migration = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8');
(async () => {
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DO $probe$
      DECLARE t text;
      BEGIN
        CREATE SCHEMA solina_qa_numbers_migration;
        PERFORM set_config('search_path', 'solina_qa_numbers_migration', true);
        FOREACH t IN ARRAY ARRAY['Conversation','ProviderCredential','Campaign','Team','Message'] LOOP
          EXECUTE format('CREATE TABLE %I (LIKE solina_qa_20260923.%I INCLUDING ALL)', t, t);
        END LOOP;
        ALTER TABLE "Conversation" DROP COLUMN "providerCredentialId";
        ALTER TABLE "Campaign" DROP COLUMN "providerCredentialId";
        ALTER TABLE "ProviderCredential" DROP COLUMN "label", DROP COLUMN "displayPhoneNumber", DROP COLUMN "teamId", DROP COLUMN "isDefault", DROP COLUMN "lastWebhookAt";
        INSERT INTO "ProviderCredential" (id,provider,config,"isActive","updatedAt") VALUES ('one','meta_whatsapp_cloud_api','{}',true,now()),('two','meta_whatsapp_cloud_api','{}',false,now());
        INSERT INTO "Conversation" (id,"contactId","updatedAt") VALUES ('known','fake',now()),('ambiguous','fake',now()),('demo','fake',now());
        INSERT INTO "Message" (id,"conversationId","providerCredentialId",direction,type) VALUES ('m1','known','one','INBOUND','TEXT'),('m2','ambiguous','one','INBOUND','TEXT'),('m3','ambiguous','two','INBOUND','TEXT');
        INSERT INTO "Campaign" (id,name,"listId","templateId","createdById","senderSnapshot","updatedAt") VALUES ('pinned','QA','fake','fake','fake','one:hash',now()),('unbound','QA','fake','fake','fake',null,now());
        ${migration}
        IF (SELECT "providerCredentialId" FROM "Conversation" WHERE id='known') IS DISTINCT FROM 'one' THEN RAISE EXCEPTION 'History backfill failed'; END IF;
        IF EXISTS(SELECT 1 FROM "Conversation" WHERE id IN ('ambiguous','demo') AND "providerCredentialId" IS NOT NULL) THEN RAISE EXCEPTION 'Unsafe history binding'; END IF;
        IF (SELECT "providerCredentialId" FROM "Campaign" WHERE id='pinned') IS DISTINCT FROM 'one' THEN RAISE EXCEPTION 'Campaign binding failed'; END IF;
        IF (SELECT count(*) FROM "ProviderCredential" WHERE "isDefault") <> 1 THEN RAISE EXCEPTION 'Default selection failed'; END IF;
        IF (SELECT count(*) FROM "Message") <> 3 THEN RAISE EXCEPTION 'History changed'; END IF;
      END $probe$`);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  const remaining = await db.$queryRaw`SELECT 1 FROM information_schema.schemata WHERE schema_name='solina_qa_numbers_migration'`;
  if (remaining.length) throw new Error('Probe did not roll back');
  console.log('PASS migration backfill, ambiguous-history protection, campaign sender, default selection, retained messages; probe rolled back');
})().catch((error) => { console.error('Migration QA failed:', error.code || error.message.split('\n')[0]); process.exitCode = 1; }).finally(() => db.$disconnect());
