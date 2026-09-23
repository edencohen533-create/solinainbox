/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit opt-in isolated PostgreSQL schema. Never uses public for QA writes.
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { execFileSync, spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');
const schema = 'solina_qa_20260923';
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  const url = new URL(process.env[key]);
  url.searchParams.set('schema', schema);
  process.env[key] = url.toString();
}
process.env.NEXTAUTH_URL = 'http://localhost:3101';
process.env.AUTH_URL = 'http://localhost:3101';
process.env.AUTH_TRUST_HOST = 'true';
process.env.CRON_SECRET = 'isolated-qa-cron';
// Do not contact production realtime from QA.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-placeholder';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-placeholder';
module.exports = { schema };

if (require.main === module) (async () => {
  const action = process.argv[2];
  if (action === 'build') {
    execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], { env: process.env, stdio: 'inherit' });
    return;
  }
  if (action === 'start' || action === 'serve') {
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(action === 'serve' ? ['start'] : ['dev', '--webpack']), '-p', '3101'], { env: process.env, stdio: 'inherit' });
    process.on('SIGTERM', () => child.kill('SIGTERM'));
    return;
  }
  const db = new PrismaClient();
  try {
    if (action === 'setup') {
      const existing = await db.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`;
      if (existing.length) throw new Error('QA schema already exists; refusing to overwrite fixtures');
      // Capture output because Prisma prints database connection metadata.
      execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' });
      const passwordHash = await bcrypt.hash('QA-only-Password-2026!', 10);
      for (const [id, role] of [['qa-admin', 'ADMIN'], ['qa-manager', 'MANAGER'], ['qa-agent-a', 'AGENT'], ['qa-agent-b', 'AGENT']]) {
        await db.user.create({ data: { id, name: id, email: `${id}@example.test`, role, passwordHash } });
      }
      await db.template.create({ data: { id: 'qa-template', name: 'qa_welcome', language: 'he', body: 'שלום {{1}}, תודה שפנית אלינו.', variables: ['1'], status: 'APPROVED' } });
      for (const [i, consentStatus] of ['OPTED_IN', 'OPTED_OUT', 'UNKNOWN', 'OPTED_IN'].entries()) await db.contact.create({ data: { id: `qa-contact-${i}`, name: `QA ליד ${i}`, phone: `+97250999000${i}`, consentStatus } });
      console.log('PASS isolated QA schema and synthetic fixtures created');
    } else if (action === 'cleanup') {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      console.log('PASS isolated QA schema removed');
    } else throw new Error('Use setup, start, or cleanup');
  } finally { await db.$disconnect(); }
})().catch((error) => { console.error('QA environment failed:', error.code || error.message.split('\n')[0]); process.exitCode = 1; });
