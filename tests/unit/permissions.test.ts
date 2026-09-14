import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { hasRole, ROLES_ADMIN, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { buildConversationScope } from "@/server/services/conversation-service";

function makeSession(role: Role, id = "user-1"): Session {
  return {
    user: { id, role, teamId: null, email: `${id}@solina.test`, name: id },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

describe("hasRole", () => {
  it("allows an admin through any role gate", () => {
    expect(hasRole(makeSession(Role.ADMIN), ROLES_ADMIN)).toBe(true);
    expect(hasRole(makeSession(Role.ADMIN), ROLES_ADMIN_MANAGER)).toBe(true);
  });

  it("allows a manager through admin+manager gates but not admin-only gates", () => {
    expect(hasRole(makeSession(Role.MANAGER), ROLES_ADMIN_MANAGER)).toBe(true);
    expect(hasRole(makeSession(Role.MANAGER), ROLES_ADMIN)).toBe(false);
  });

  it("blocks an agent from admin/manager-only gates", () => {
    expect(hasRole(makeSession(Role.AGENT), ROLES_ADMIN_MANAGER)).toBe(false);
  });

  it("blocks an unauthenticated session", () => {
    expect(hasRole(null, ROLES_ADMIN)).toBe(false);
  });
});

describe("buildConversationScope", () => {
  it("scopes an agent to their own assigned conversations plus unassigned ones", () => {
    const session = makeSession(Role.AGENT, "agent-1");
    const where = buildConversationScope(session);

    expect(where).toEqual({
      AND: [{ OR: [{ assignedAgentId: "agent-1" }, { assignedAgentId: null }] }],
    });
  });

  it("does not restrict admins or managers to a subset of conversations", () => {
    expect(buildConversationScope(makeSession(Role.ADMIN))).toEqual({});
    expect(buildConversationScope(makeSession(Role.MANAGER))).toEqual({});
  });

  it("combines the agent scope with an additional status filter", () => {
    const session = makeSession(Role.AGENT, "agent-1");
    const where = buildConversationScope(session, { status: "OPEN" });

    expect(where).toEqual({
      AND: [{ OR: [{ assignedAgentId: "agent-1" }, { assignedAgentId: null }] }, { status: "OPEN" }],
    });
  });
});
