import { organizationRequest } from "@/lib/organization-request";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

export const POST = organizationRequest(async function() {
  const session = await auth();
  if (!hasRole(session, ROLES_ADMIN_MANAGER)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const result = await prisma.$transaction(async (tx) => {
    const rules = await tx.automationRule.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const runs = await tx.automationRun.updateMany({ where: { status: "PENDING" }, data: {
      status: "COMPLETED", completedAt: new Date(), result: { skipped: "manager stopped all automations" },
    } });
    await tx.auditLog.create({ data: { actorUserId: session!.user.id, action: "automation.stop_all", entityType: "AutomationRule", entityId: "all", metadata: { rules: rules.count, runs: runs.count } } });
    return { stoppedRules: rules.count, cancelledPendingRuns: runs.count };
  });
  return Response.json(result);
});
