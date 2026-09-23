// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.unmock("@/lib/organization-context");
const { scan, rotate } = vi.hoisted(() => ({ scan: vi.fn(), rotate: vi.fn() }));
vi.mock("@/lib/system-database", () => ({ systemDatabase: { organization: { findMany: scan, update: rotate } } }));
import { requireOrganizationId } from "@/lib/organization-context";
import { processOrganizations } from "@/jobs/organization-runner";
beforeEach(() => { vi.restoreAllMocks(); scan.mockReset(); rotate.mockReset(); rotate.mockResolvedValue({}); });
it("continues another business after a worker failure without inheriting the failed scope", async () => {
  scan.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const visited: string[] = [];
  const result = await processOrganizations("campaign", async () => {
    const id = requireOrganizationId(); visited.push(id);
    if (id === "a") throw new Error("sensitive provider payload that must not be logged");
    return { processed: 3 };
  });
  expect(visited).toEqual(["a", "b"]);
  expect(result).toEqual({ processed: 3, organizations: 2, failed: 1 });
  expect(rotate).toHaveBeenCalledTimes(2);
  expect(() => requireOrganizationId()).toThrow("required");
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sensitive provider");
});
