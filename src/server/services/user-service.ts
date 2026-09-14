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

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createUser(input: CreateUserInput, actorUserId: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new DuplicateEmailError(input.email);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, role: input.role, passwordHash },
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
  const user = await prisma.user.update({ where: { id }, data: { isActive } });

  await writeAuditLog({
    actorUserId,
    action: isActive ? "user.activated" : "user.deactivated",
    entityType: "User",
    entityId: id,
  });

  return user;
}
