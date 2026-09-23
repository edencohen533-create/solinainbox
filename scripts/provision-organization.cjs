/* eslint-disable @typescript-eslint/no-require-imports */
// Operator-only provisioning. Never expose the privileged client through a web route.
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
(async () => {
  const [name, email] = process.argv.slice(2);
  const password = process.env.ORGANIZATION_ADMIN_PASSWORD;
  if (!name?.trim() || !email?.includes('@') || !password || password.length < 16) throw new Error('Usage: ORGANIZATION_ADMIN_PASSWORD=<secret of at least 16 characters> node scripts/provision-organization.cjs <business-name> <admin-email>');
  const passwordHash = await bcrypt.hash(password, 12);
  const organization = await db.$transaction(async (tx) => {
    const workspace = await tx.organization.create({ data: { name: name.trim() } });
    await tx.user.create({ data: { organizationId: workspace.id, name: name.trim(), email: email.trim().toLowerCase(), role: 'ADMIN', passwordHash } });
    await tx.auditLog.create({ data: { organizationId: workspace.id, action: 'organization.provisioned', entityType: 'Organization', entityId: workspace.id } });
    return workspace;
  });
  console.log(JSON.stringify({ organizationId: organization.id, created: true }));
})().catch((error) => { console.error(error.code === 'P2002' ? 'Admin email already exists; nothing was created.' : 'Provisioning failed. Supply business name, unique email and a password of at least 16 characters.'); process.exitCode = 1; }).finally(() => db.$disconnect());
