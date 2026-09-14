import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RightNav } from "@/components/layout/right-nav";
import { TopBar } from "@/components/layout/top-bar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <RightNav role={session.user.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar name={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
