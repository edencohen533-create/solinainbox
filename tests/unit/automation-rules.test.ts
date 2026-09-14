import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationActionType, AutomationRunStatus, AutomationTrigger } from "@prisma/client";

const automationRuleFindMany = vi.fn();
const automationRuleFindUniqueOrThrow = vi.fn();
const automationRuleFindUnique = vi.fn();
const automationRunCreate = vi.fn();
const automationRunUpdate = vi.fn();
const automationRunUpdateMany = vi.fn();
const automationRunFindMany = vi.fn();
const conversationUpdate = vi.fn();
const conversationFindUnique = vi.fn();
const tagFindUnique = vi.fn();
const noteCreate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationRule: {
      findMany: (...a: unknown[]) => automationRuleFindMany(...a),
      findUniqueOrThrow: (...a: unknown[]) => automationRuleFindUniqueOrThrow(...a),
      findUnique: (...a: unknown[]) => automationRuleFindUnique(...a),
    },
    automationRun: {
      create: (...a: unknown[]) => automationRunCreate(...a),
      update: (...a: unknown[]) => automationRunUpdate(...a),
      updateMany: (...a: unknown[]) => automationRunUpdateMany(...a),
      findMany: (...a: unknown[]) => automationRunFindMany(...a),
    },
    conversation: {
      update: (...a: unknown[]) => conversationUpdate(...a),
      findUnique: (...a: unknown[]) => conversationFindUnique(...a),
    },
    tag: {
      findUnique: (...a: unknown[]) => tagFindUnique(...a),
      upsert: vi.fn(),
    },
    conversationTag: { upsert: vi.fn() },
    note: { create: (...a: unknown[]) => noteCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    user: { findFirst: vi.fn().mockResolvedValue({ id: "admin-1" }) },
  },
}));

vi.mock("@/server/services/message-service", () => ({
  createOutboundMessage: vi.fn().mockResolvedValue({ message: { id: "msg-x" } }),
}));

import { evaluateTrigger } from "@/server/services/automation-service";
import { processDueAutomationRuns } from "@/jobs/automation-runner";

function resetAll() {
  for (const fn of [
    automationRuleFindMany,
    automationRuleFindUniqueOrThrow,
    automationRuleFindUnique,
    automationRunCreate,
    automationRunUpdate,
    automationRunUpdateMany,
    automationRunFindMany,
    conversationUpdate,
    conversationFindUnique,
    tagFindUnique,
    noteCreate,
    auditLogCreate,
  ]) {
    fn.mockReset();
  }
}

describe("evaluateTrigger / runRule (immediate triggers)", () => {
  beforeEach(resetAll);
  afterEach(() => vi.clearAllMocks());

  it("assigns an agent when a NEW_INBOUND_MESSAGE rule matches an unassigned conversation", async () => {
    const rule = {
      id: "rule-1",
      trigger: AutomationTrigger.NEW_INBOUND_MESSAGE,
      triggerConfig: {},
      actionType: AutomationActionType.ASSIGN_AGENT,
      actionConfig: { agentId: "agent-1" },
      isActive: true,
    };
    automationRuleFindMany.mockResolvedValue([rule]);
    automationRuleFindUniqueOrThrow.mockResolvedValue(rule);
    automationRunCreate.mockResolvedValue({ id: "run-1" });
    conversationUpdate.mockResolvedValue({});
    automationRunUpdate.mockResolvedValue({});

    await evaluateTrigger(AutomationTrigger.NEW_INBOUND_MESSAGE, { conversationId: "conv-1" });

    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { assignedAgentId: "agent-1" },
    });
    expect(automationRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: AutomationRunStatus.COMPLETED }),
      })
    );
  });

  it("creates a note when a TAG_ADDED rule matches the configured tag", async () => {
    const rule = {
      id: "rule-2",
      trigger: AutomationTrigger.TAG_ADDED,
      triggerConfig: { tagName: "VIP" },
      actionType: AutomationActionType.ADD_INTERNAL_NOTE,
      actionConfig: { body: "טופל בעדיפות" },
      isActive: true,
    };
    automationRuleFindMany.mockResolvedValue([rule]);
    automationRuleFindUniqueOrThrow.mockResolvedValue(rule);
    tagFindUnique.mockResolvedValue({ id: "tag-1", name: "VIP" });
    automationRunCreate.mockResolvedValue({ id: "run-2" });
    noteCreate.mockResolvedValue({ id: "note-1" });
    automationRunUpdate.mockResolvedValue({});

    await evaluateTrigger(AutomationTrigger.TAG_ADDED, { conversationId: "conv-1", tagId: "tag-1" });

    expect(noteCreate).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the tag name doesn't match the rule's configured tag", async () => {
    const rule = {
      id: "rule-3",
      trigger: AutomationTrigger.TAG_ADDED,
      triggerConfig: { tagName: "VIP" },
      actionType: AutomationActionType.ADD_INTERNAL_NOTE,
      actionConfig: { body: "x" },
      isActive: true,
    };
    automationRuleFindMany.mockResolvedValue([rule]);
    tagFindUnique.mockResolvedValue({ id: "tag-2", name: "לקוח חוזר" });

    await evaluateTrigger(AutomationTrigger.TAG_ADDED, { conversationId: "conv-1", tagId: "tag-2" });

    expect(automationRunCreate).not.toHaveBeenCalled();
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("never fires an inactive rule", async () => {
    automationRuleFindMany.mockResolvedValue([]); // inactive rules excluded by the findMany where clause

    await evaluateTrigger(AutomationTrigger.NEW_CONVERSATION, { conversationId: "conv-1" });

    expect(automationRunCreate).not.toHaveBeenCalled();
  });
});

describe("processDueAutomationRuns (delayed NO_REPLY_TIMEOUT re-validation)", () => {
  beforeEach(resetAll);
  afterEach(() => vi.clearAllMocks());

  it("fires the action when the conversation is still unanswered", async () => {
    const run = { id: "run-4", ruleId: "rule-4", conversationId: "conv-1", status: AutomationRunStatus.PENDING };
    automationRunFindMany.mockResolvedValue([run]);
    automationRunUpdateMany.mockResolvedValue({ count: 1 });
    automationRuleFindUnique.mockResolvedValue({
      id: "rule-4",
      isActive: true,
      actionType: AutomationActionType.ADD_INTERNAL_NOTE,
      actionConfig: { body: "אין מענה" },
    });
    const lastInboundAt = new Date("2026-01-01T10:00:00Z");
    conversationFindUnique.mockResolvedValue({
      lastInboundAt,
      lastMessageAt: lastInboundAt, // no reply since — still unanswered
    });
    noteCreate.mockResolvedValue({ id: "note-x" });
    automationRunUpdate.mockResolvedValue({});

    const result = await processDueAutomationRuns();

    expect(result.processed).toBe(1);
    expect(noteCreate).toHaveBeenCalledTimes(1);
    expect(automationRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AutomationRunStatus.COMPLETED }) })
    );
  });

  it("skips the action as a no-op when an agent already replied before the run fired", async () => {
    const run = { id: "run-5", ruleId: "rule-5", conversationId: "conv-1", status: AutomationRunStatus.PENDING };
    automationRunFindMany.mockResolvedValue([run]);
    automationRunUpdateMany.mockResolvedValue({ count: 1 });
    automationRuleFindUnique.mockResolvedValue({
      id: "rule-5",
      isActive: true,
      actionType: AutomationActionType.ADD_INTERNAL_NOTE,
      actionConfig: { body: "אין מענה" },
    });
    conversationFindUnique.mockResolvedValue({
      lastInboundAt: new Date("2026-01-01T10:00:00Z"),
      lastMessageAt: new Date("2026-01-01T10:05:00Z"), // a later (outbound) message exists — answered
    });
    automationRunUpdate.mockResolvedValue({});

    await processDueAutomationRuns();

    expect(noteCreate).not.toHaveBeenCalled();
    expect(automationRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AutomationRunStatus.COMPLETED,
          result: expect.objectContaining({ skipped: expect.any(String) }),
        }),
      })
    );
  });

  it("does not double-process a run already claimed by a concurrent invocation", async () => {
    const run = { id: "run-6", ruleId: "rule-6", conversationId: "conv-1", status: AutomationRunStatus.PENDING };
    automationRunFindMany.mockResolvedValue([run]);
    automationRunUpdateMany.mockResolvedValue({ count: 0 }); // lost the claim race

    const result = await processDueAutomationRuns();

    expect(result.processed).toBe(0);
    expect(automationRuleFindUnique).not.toHaveBeenCalled();
  });
});
