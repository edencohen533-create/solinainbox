/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
require('./qa-environment.cjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const rollback = new Error('verified rollback');
const filename = fs.readdirSync('supabase/migrations').find((name) => name.endsWith('_whatsapp_saved_audiences.sql'));
const migration = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8');
(async () => {
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DO $probe$ BEGIN
        CREATE SCHEMA solina_qa_audience_migration;
        PERFORM set_config('search_path', 'solina_qa_audience_migration', true);
        CREATE TABLE "DistributionList" (LIKE solina_qa_20260923."DistributionList" INCLUDING ALL);
        CREATE TABLE "Campaign" (LIKE solina_qa_20260923."Campaign" INCLUDING ALL);
        ALTER TABLE "DistributionList" DROP COLUMN "segment";
        ALTER TABLE "Campaign" DROP COLUMN "audienceExcludedCount", DROP COLUMN "audienceSnapshot", DROP COLUMN "excludedListIds";
        INSERT INTO "DistributionList" (id,name) VALUES ('existing','Existing list');
        INSERT INTO "Campaign" (id,name,"listId","templateId","createdById","updatedAt") VALUES ('existing','Existing campaign','existing','fake','fake',now());
        ${migration}
        IF (SELECT "segment" FROM "DistributionList" WHERE id='existing') IS NOT NULL THEN RAISE EXCEPTION 'Existing list changed to dynamic'; END IF;
        IF (SELECT "audienceExcludedCount" FROM "Campaign" WHERE id='existing') <> 0 OR (SELECT "excludedListIds" FROM "Campaign" WHERE id='existing') <> '[]'::jsonb THEN RAISE EXCEPTION 'Existing campaign exclusions changed'; END IF;
        IF (SELECT name FROM "Campaign" WHERE id='existing') IS DISTINCT FROM 'Existing campaign' THEN RAISE EXCEPTION 'Campaign data changed'; END IF;
      END $probe$`);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  const remaining = await db.$queryRaw`SELECT 1 FROM information_schema.schemata WHERE schema_name='solina_qa_audience_migration'`;
  if (remaining.length) throw new Error('Probe did not roll back');
  console.log('PASS audience migration preserves static lists/campaigns and initializes empty exclusions; probe rolled back');
})().catch((error) => { console.error('Migration QA failed:', error.code || error.message.split('\n')[0]); process.exitCode = 1; }).finally(() => db.$disconnect());
