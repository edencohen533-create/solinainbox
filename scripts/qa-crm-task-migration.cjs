/* eslint-disable @typescript-eslint/no-require-imports */
require('./qa-environment.cjs');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const filename = fs.readdirSync('supabase/migrations').find((name) => name.endsWith('_whatsapp_crm_tasks.sql'));
const migration = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8');
const rollback = new Error('verified rollback');
(async () => {
  if (new URL(process.env.DATABASE_URL).searchParams.get('schema') !== 'solina_qa_20260923') throw new Error('Isolated QA required');
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DO $probe$ BEGIN
        CREATE SCHEMA solina_qa_task_migration;
        PERFORM set_config('search_path', 'solina_qa_task_migration', true);
        CREATE TABLE "Organization" (LIKE solina_qa_20260923."Organization" INCLUDING ALL);
        CREATE TABLE "User" (LIKE solina_qa_20260923."User" INCLUDING ALL);
        CREATE TABLE "Contact" (LIKE solina_qa_20260923."Contact" INCLUDING ALL);
        CREATE TABLE "Conversation" (LIKE solina_qa_20260923."Conversation" INCLUDING ALL);
        ${migration}
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='"ContactTask"'::regclass) THEN RAISE EXCEPTION 'RLS missing'; END IF;
        IF has_table_privilege('anon', '"ContactTask"', 'SELECT') OR has_table_privilege('authenticated', '"ContactTask"', 'INSERT') THEN RAISE EXCEPTION 'Browser access granted'; END IF;
        IF (SELECT count(*) FROM pg_constraint WHERE conrelid='"ContactTask"'::regclass AND contype='f') <> 9 THEN RAISE EXCEPTION 'Foreign keys missing'; END IF;
      END $probe$`);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  const remaining = await db.$queryRaw`SELECT 1 FROM information_schema.schemata WHERE schema_name='solina_qa_task_migration'`;
  if (remaining.length) throw new Error('Probe rollback failed');
  console.log('PASS additive task migration rehearsal: RLS, browser grant denial, nine foreign keys; rolled back');
  if (process.argv.includes('--apply-qa')) {
    await db.$executeRawUnsafe(`DO $apply$ BEGIN PERFORM set_config('search_path', 'solina_qa_20260923', true); ${migration} END $apply$`);
    console.log('PASS task migration applied only to isolated QA schema');
  }
})().catch((error) => { console.error('Task migration QA failed:', error.code || error.message.split('\n')[0]); process.exitCode = 1; }).finally(() => db.$disconnect());
