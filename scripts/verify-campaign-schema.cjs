/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS Node verification script. */
// All DDL and fixtures are rolled back. Never sends WhatsApp messages.
require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const marker = new Error('ROLLBACK_VERIFIED_FIXTURES');
(async () => {
  try {
    await db.$transaction(async (tx) => {
      // Only verify the additive script when it has not yet been applied.
      const existing = await tx.$queryRaw`SELECT to_regclass('public."Campaign"')::text AS name`;
      if (!existing[0].name) {
        const sql = fs.readFileSync('prisma/changes/campaigns.sql', 'utf8');
        const [ddl, block] = sql.split('DO $$');
        for (const statement of ddl.split(';').filter((s) => s.trim())) await tx.$executeRawUnsafe(statement);
        if (block) await tx.$executeRawUnsafe('DO $$' + block);
      }
      const inboxSchema = await tx.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Message' AND column_name='inboundKey'`;
      if (!inboxSchema.length) {
        const sql = fs.readFileSync('prisma/changes/inbox-reliability.sql', 'utf8');
        for (const statement of sql.split(';').filter((s) => s.trim())) await tx.$executeRawUnsafe(statement);
      }
      const tables = await tx.$queryRaw`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('Campaign','CampaignRecipient','DistributionList','DistributionListMember')`;
      assert.equal(tables.length, 4);
      assert.ok(tables.every((t) => t.rowsecurity));
      const user = await tx.user.findFirst({ where: { isActive: true, role: 'ADMIN' } });
      const contact = await tx.contact.findFirst();
      const template = await tx.template.findFirst({ where: { status: 'APPROVED' } });
      assert.ok(user && contact && template, 'Existing demo records required for relational checks');
      const list = await tx.distributionList.create({ data: { name: '__rollback_campaign_qa__', members: { create: [{ contactId: contact.id }] } } });
      const campaign = await tx.campaign.create({ data: { name: '__rollback_campaign_qa__', listId: list.id, templateId: template.id, createdById: user.id, recipients: { create: [{ contactId: contact.id }] } } });
      assert.equal((await tx.campaignRecipient.findMany({ where: { campaignId: campaign.id } })).length, 1);
      const duplicates = await tx.campaignRecipient.createMany({ data: [{ campaignId: campaign.id, contactId: contact.id }], skipDuplicates: true });
      assert.equal(duplicates.count, 0);
      const first = await tx.campaignRecipient.updateMany({ where: { campaignId: campaign.id, status: 'QUEUED' }, data: { status: 'PROCESSING', claimedAt: new Date() } });
      const second = await tx.campaignRecipient.updateMany({ where: { campaignId: campaign.id, status: 'QUEUED' }, data: { status: 'PROCESSING', claimedAt: new Date() } });
      assert.equal(first.count, 1); assert.equal(second.count, 0);
      const conversation = await tx.conversation.create({ data: { contactId: contact.id, source: 'MOCK' } });
      const dedup = await tx.message.createMany({ data: [1, 2].map(() => ({ conversationId: conversation.id, direction: 'INBOUND', type: 'TEXT', inboundKey: '__rollback_unique_inbound__' })), skipDuplicates: true });
      assert.equal(dedup.count, 1);
      await tx.template.create({ data: { name: template.name, language: '__qa__', body: 'test' } });
      console.log('PASS: DDL, RLS, foreign keys, recipient uniqueness, atomic claims, inbound deduplication, multilingual templates');
      throw marker;
    }, { timeout: 45000 });
  } catch (error) {
    if (error !== marker) throw error;
  }
  console.log('PASS: transaction rolled back; no production records or schema changed');
})().catch((error) => { console.error(error.name, error.code || 'verification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
