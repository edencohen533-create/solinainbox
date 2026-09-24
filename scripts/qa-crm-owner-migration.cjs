/* eslint-disable @typescript-eslint/no-require-imports */
require('./qa-environment.cjs');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const filename = fs.readdirSync('supabase/migrations').find((name) => name.endsWith('_whatsapp_crm_ownership.sql'));
const migration = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8');
const rollback = new Error('verified rollback');
(async () => {
  if (new URL(process.env.DATABASE_URL).searchParams.get('schema') !== 'solina_qa_20260923') throw new Error('Isolated QA required');
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DO $probe$ BEGIN
        CREATE SCHEMA solina_qa_owner_migration;
        PERFORM set_config('search_path', 'solina_qa_owner_migration', true);
        CREATE TABLE "User" (LIKE solina_qa_20260923."User" INCLUDING ALL);
        CREATE TABLE "Contact" (LIKE solina_qa_20260923."Contact" INCLUDING ALL);
        INSERT INTO "Contact" (id,name,phone,"updatedAt") VALUES ('old','Existing contact','+972509000011',now());
        ${migration}
        IF (SELECT "leadStage" FROM "Contact" WHERE id='old') IS NOT NULL OR (SELECT "ownerId" FROM "Contact" WHERE id='old') IS NOT NULL THEN RAISE EXCEPTION 'Historical CRM state invented'; END IF;
        INSERT INTO "Contact" (id,name,phone,"updatedAt") VALUES ('new','New contact','+972509000012',now());
        IF (SELECT "leadStage" FROM "Contact" WHERE id='new') IS DISTINCT FROM 'NEW' THEN RAISE EXCEPTION 'New lead default missing'; END IF;
        IF (SELECT count(*) FROM "Contact") <> 2 THEN RAISE EXCEPTION 'Contact preservation failed'; END IF;
      END $probe$`);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  const remaining = await db.$queryRaw`SELECT 1 FROM information_schema.schemata WHERE schema_name='solina_qa_owner_migration'`;
  if (remaining.length) throw new Error('Probe rollback failed');
  console.log('PASS ownership migration: existing contacts unclassified/unassigned, new leads default NEW; rolled back');
  if (process.argv.includes('--apply-qa')) {
    await db.$executeRawUnsafe(`DO $apply$ BEGIN PERFORM set_config('search_path', 'solina_qa_20260923', true); ${migration} END $apply$`);
    console.log('PASS ownership migration applied only to isolated QA');
  }
})().catch((error) => { console.error('Ownership migration QA failed:', error.code || error.message.split('\n')[0]); process.exitCode = 1; }).finally(() => db.$disconnect());
