import { Role } from "@prisma/client";
import type { Session } from "next-auth";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function hasRole(session: Session | null, allowed: Role[]): boolean {
  return !!session?.user && allowed.includes(session.user.role);
}

export function requireRole(session: Session | null, allowed: Role[]): asserts session is Session {
  if (!hasRole(session, allowed)) {
    throw new ForbiddenError();
  }
}

export const ROLES_ADMIN: Role[] = [Role.ADMIN];
export const ROLES_ADMIN_MANAGER: Role[] = [Role.ADMIN, Role.MANAGER];
export const ROLES_ALL: Role[] = [Role.ADMIN, Role.MANAGER, Role.AGENT];
