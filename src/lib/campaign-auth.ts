import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Recheck the database: disabling or demoting a user must revoke campaign access immediately.
export async function campaignActor() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, isActive: true } });
  return user?.isActive && (user.role === "ADMIN" || user.role === "MANAGER") ? user : null;
}
