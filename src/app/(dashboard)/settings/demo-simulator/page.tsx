import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { AccessDenied } from "@/components/shared/access-denied";
import { prisma } from "@/lib/prisma";
import { DemoSimulatorForm } from "./demo-simulator-form";

export default async function DemoSimulatorPage() {
  const session = await auth();

  if (!hasRole(session, ROLES_ADMIN_MANAGER)) {
    return <AccessDenied />;
  }

  const contacts = await prisma.contact.findMany({
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold">סימולטור וואטסאפ (Demo)</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        שלח הודעה נכנסת מדומה מאיש קשר קיים כדי לבדוק את התיבה בזמן אמת.
      </p>
      <DemoSimulatorForm contacts={contacts} />
    </div>
  );
}
