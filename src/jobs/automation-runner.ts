import { prisma } from "@/lib/prisma";
import { AutomationRunStatus, type Prisma } from "@prisma/client";
import { executeAction } from "@/server/services/automation-service";

/**
 * Processes due delayed AutomationRun rows (currently only produced by the
 * NO_REPLY_TIMEOUT trigger). Called from the Vercel Cron-triggered route.
 * Re-validates the trigger condition still holds before executing the
 * action, since state may have changed between scheduling and firing —
 * e.g. an agent may have replied in the meantime.
 */
export async function processDueAutomationRuns(): Promise<{ processed: number }> {
  const due = await prisma.automationRun.findMany({
    where: { status: AutomationRunStatus.PENDING, scheduledFor: { lte: new Date() } },
    take: 25,
  });

  let processed = 0;

  for (const run of due) {
    const claimed = await prisma.automationRun.updateMany({
      where: { id: run.id, status: AutomationRunStatus.PENDING },
      data: { status: AutomationRunStatus.RUNNING },
    });
    if (claimed.count === 0) continue; // claimed by a concurrent invocation

    processed++;

    const rule = await prisma.automationRule.findUnique({ where: { id: run.ruleId } });
    if (!rule || !rule.isActive || !run.conversationId) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: { status: AutomationRunStatus.COMPLETED, result: { skipped: "rule inactive or no conversation" }, completedAt: new Date() },
      });
      continue;
    }

    const conversation = await prisma.conversation.findUnique({ where: { id: run.conversationId } });
    const stillUnanswered =
      conversation?.lastInboundAt &&
      (!conversation.lastMessageAt || conversation.lastMessageAt.getTime() <= conversation.lastInboundAt.getTime());

    if (!stillUnanswered) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: AutomationRunStatus.COMPLETED,
          result: { skipped: "condition no longer holds — conversation was answered" },
          completedAt: new Date(),
        },
      });
      continue;
    }

    try {
      const result = await executeAction(rule.actionType, rule.actionConfig as Record<string, unknown>, {
        conversationId: run.conversationId,
      });
      await prisma.automationRun.update({
        where: { id: run.id },
        data: { status: AutomationRunStatus.COMPLETED, result: result as Prisma.InputJsonValue, completedAt: new Date() },
      });
    } catch (error) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: AutomationRunStatus.FAILED,
          error: error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        },
      });
    }
  }

  return { processed };
}
