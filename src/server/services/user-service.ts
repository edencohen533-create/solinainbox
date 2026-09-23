import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { CreateUserInput } from "@/lib/validation/user";

export class DuplicateEmailError extends Error {
  constructor(public email: string) {
    super(`A user with email ${email} already exists`);
    this.name = "DuplicateEmailError";
  }
}

const publicUserFields = { id: true, name: true, email: true, role: true, teamId: true, isActive: true, avatarUrl: true, createdAt: true, updatedAt: true } as const;

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: publicUserFields });
}

export async function createUser(input: CreateUserInput, actorUserId: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new DuplicateEmailError(input.email);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, role: input.role, passwordHash },
    select: publicUserFields,
  });

  await writeAuditLog({
    actorUserId,
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  return user;
}

export async function setUserActive(id: string, isActive: boolean, actorUserId: string) {
  const user = await prisma.user.update({ where: { id }, data: { isActive }, select: publicUserFields });

  await writeAuditLog({
    actorUserId,
    action: isActive ? "user.activated" : "user.deactivated",
    entityType: "User",
    entityId: id,
  });

  return user;
}

export async function resetUserPassword(id: string, password: string, actorUserId: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({ where: { id }, data: { passwordHash }, select: publicUserFields });
  await writeAuditLog({ actorUserId, action: "user.password_changed", entityType: "User", entityId: id });
  return user;
}

export class InvalidTeamError extends Error {}
export async function setUserTeam(id: string, teamId: string | null, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    if (teamId && !await tx.team.findUnique({ where: { id: teamId }, select: { id: true } })) throw new InvalidTeamError("הצוות אינו נגיש");
    const user = await tx.user.update({ where: { id }, data: { teamId }, select: publicUserFields });
    if (user.role === "AGENT") await tx.conversation.updateMany({ where: { assignedAgentId: id, providerCredential: { teamId: teamId ? { not: teamId } : { not: null } } }, data: { assignedAgentId: null } });
    await tx.auditLog.create({ data: { actorUserId, action: "user.team_changed", entityType: "User", entityId: id, metadata: { teamId } } });
    return user;
  });
}
