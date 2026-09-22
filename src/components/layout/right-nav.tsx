"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";

export function RightNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav className="flex h-full w-56 flex-col gap-1 border-e bg-sidebar p-3 text-sidebar-foreground">
      <div className="mb-4 px-2 text-lg font-bold">Solina Inbox</div>
      {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
        const basePath = item.href.split("?")[0];
        const filter = new URLSearchParams(item.href.split("?")[1]).get("filter");
        const isActive = pathname === basePath && (basePath !== "/inbox" || filter === searchParams.get("filter"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
