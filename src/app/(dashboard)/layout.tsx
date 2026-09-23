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
    <div className="flex h-dvh w-full flex-col overflow-hidden lg:flex-row">
      <RightNav role={session.user.role} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar name={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
