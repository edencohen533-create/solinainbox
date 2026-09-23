import { templateParameterKeys } from "@/lib/campaigns";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { AccessDenied } from "@/components/shared/access-denied";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { listRules } from "@/server/services/automation-service";
import { RuleBuilder } from "@/components/automations/rule-builder";
import { StopAutomationsButton } from "@/components/automations/stop-automations-button";
import { RuleList } from "@/components/automations/rule-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default async function AutomationsPage() {
  if (!hasRole(await auth(), ROLES_ADMIN_MANAGER)) return <AccessDenied />;
  const [rules, agents, cannedReplies, templates] = await Promise.all([
    listRules(),
    prisma.user.findMany({ where: { role: { in: [Role.AGENT, Role.MANAGER] }, isActive: true }, select: { id: true, name: true } }),
    prisma.cannedReply.findMany({ select: { id: true, title: true } }),
    prisma.template.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true, body: true } }),
  ]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">אוטומציות</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" render={<Link href="/automations/history">היסטוריית הרצות</Link>} />
          <StopAutomationsButton />
          <RuleBuilder
            agents={agents.map((a) => ({ id: a.id, label: a.name }))}
            cannedReplies={cannedReplies.map((c) => ({ id: c.id, label: c.title }))}
            templates={templates.map((t) => ({ id: t.id, label: t.name, variables: templateParameterKeys(t.body) }))}
          />
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState title="אין חוקי אוטומציה עדיין" description="צור חוק חדש כדי להתחיל." />
      ) : (
        <RuleList key={rules.map((r) => `${r.id}:${r.isActive}`).join(",")} rules={rules} />
      )}
    </div>
  );
}
