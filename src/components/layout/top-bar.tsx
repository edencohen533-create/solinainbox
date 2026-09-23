"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "מנהל מערכת",
  MANAGER: "מנהל צוות",
  AGENT: "נציג",
};

export function TopBar({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      <form role="search" className="relative min-w-0 max-w-sm flex-1" onSubmit={(event) => { event.preventDefault(); router.push(`/inbox?search=${encodeURIComponent(search.trim())}`); }}>
        <Search className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="חיפוש שיחות" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש שיחות..." className="pe-8" />
      </form>
      <div className="hidden flex-1 md:block" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="flex items-center gap-2 px-2" />}>
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start text-start">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>החשבון שלי</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
            התנתקות
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
