// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
vi.unmock("@/lib/organization-request");
vi.unmock("@/lib/organization-context");
const { authenticate } = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: authenticate }));
import { organizationRequest } from "@/lib/organization-request";
import { withOrganization, requireOrganizationId } from "@/lib/organization-context";

describe("organization boundary", () => {
  it("fails closed without context and does not leak across concurrent asynchronous requests", async () => {
    expect(() => requireOrganizationId()).toThrow("required");
    const results = await Promise.all(["a", "b"].map((id) => withOrganization(id, async () => {
      await new Promise((resolve) => setTimeout(resolve, id === "a" ? 10 : 1));
      return requireOrganizationId();
    })));
    expect(results).toEqual(["a", "b"]);
    expect(() => requireOrganizationId()).toThrow("required");
  });
  it("takes scope only from the authenticated session, never request headers/body", async () => {
    authenticate.mockResolvedValue({ user: { organizationId: "a" } });
    const handler = organizationRequest(async (request: Request) => { expect(request).toBeInstanceOf(Request); return requireOrganizationId(); });
    expect(await handler(new Request("https://test", { method: "POST", headers: { "x-organization-id": "b" }, body: '{"organizationId":"b"}' }))).toBe("a");
    authenticate.mockResolvedValue(null);
    await expect(handler(new Request("https://test"))).rejects.toThrow("required");
  });
  it("keeps privileged database access confined to trusted bootstrap boundaries", () => {
    const allowed = new Set(["src/lib/system-database.ts", "src/lib/prisma.ts", "src/lib/auth.ts", "src/jobs/organization-runner.ts", "src/app/api/webhooks/whatsapp/route.ts"]);
    function walk(directory: string): string[] { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
    for (const file of walk("src").filter((file) => /\.tsx?$/.test(file))) {
      const text = fs.readFileSync(file, "utf8");
      if (text.includes("system-database")) expect(allowed.has(file), file).toBe(true);
      if (/new\s+PrismaClient\b/.test(text)) expect(file).toBe("src/lib/system-database.ts");
      if (/withOrganization\(/.test(text)) expect(["src/lib/organization-request.ts", "src/jobs/organization-runner.ts", "src/app/api/webhooks/whatsapp/route.ts"], file).toContain(file);
      if (/src\/app\/api\//.test(file) && file.endsWith("route.ts") && !/\/api\/(auth|cron|webhooks)\//.test(file)) expect(text, file).toContain("organizationRequest(");
    }
  });
});
