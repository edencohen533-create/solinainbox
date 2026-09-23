import { prisma } from "@/lib/prisma";
import { TeamManager } from "@/components/settings/team-manager";
import { organizationRequest } from "@/lib/organization-request";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN_MANAGER, ROLES_ADMIN } from "@/lib/auth-guards";
import { AccessDenied } from "@/components/shared/access-denied";
import { listUsers } from "@/server/services/user-service";
import { UserTable } from "@/components/settings/user-table";
import { NewUserDialog } from "@/components/settings/new-user-dialog";

export default organizationRequest(async function UsersSettingsPage() {
  const session = await auth();

  if (!hasRole(session, ROLES_ADMIN_MANAGER)) {
    return <AccessDenied />;
  }

  const [users, teams] = await Promise.all([listUsers(), prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const canManage = hasRole(session, ROLES_ADMIN);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">ניהול צוות</h1>
        {canManage && <NewUserDialog />}
      </div>
      {canManage && <TeamManager />}
      <p className="mb-3 text-sm text-muted-foreground">שינוי צוות של נציג משחרר שיחות במספרים שאינם נגישים לצוות החדש ומחייב כניסה מחדש.</p>
      <UserTable users={users} teams={teams} canManage={canManage} />
    </div>
  );
});
