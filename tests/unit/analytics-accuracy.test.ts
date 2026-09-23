import { expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: { conversation: { count: vi.fn(), findMany: vi.fn() }, message: { count: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { getOverviewStats } from "@/server/services/analytics-service";
it("excludes failed/unknown outbound attempts from first response and never invents closure duration", async () => {
  const time = new Date("2026-09-20T10:00:00Z");
  db.conversation.count.mockResolvedValue(1); db.message.count.mockResolvedValue(5);
  db.conversation.findMany.mockResolvedValue([{ id: "c", createdAt: time, updatedAt: new Date(), status: "CLOSED", assignedAgentId: "a", assignedAgent: { name: "Agent" }, messages: [
    { direction: "INBOUND", status: "SENT", createdAt: time },
    { direction: "OUTBOUND", status: "FAILED", createdAt: new Date(time.getTime()+60000) },
    { direction: "OUTBOUND", status: "UNKNOWN", createdAt: new Date(time.getTime()+120000) },
    { direction: "OUTBOUND", status: "DELIVERED", createdAt: new Date(time.getTime()+180000) },
  ] }]);
  const stats = await getOverviewStats({ from: time, to: new Date() });
  expect(stats.avgFirstResponseMinutes).toBe(3); expect(stats.firstResponseCount).toBe(1);
  expect(stats.avgResolutionHours).toBeNull(); expect(stats.perAgent).toEqual([{ name: "Agent", total: 1, resolved: 1 }]);
});
