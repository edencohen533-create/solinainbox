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

  const users = await listUsers();
  const canManage = hasRole(session, ROLES_ADMIN);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">ניהול צוות</h1>
        {canManage && <NewUserDialog />}
      </div>
      <UserTable users={users} canManage={canManage} />
    </div>
  );
});
