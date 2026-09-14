"use client";

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
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
      <div className="relative max-w-sm flex-1">
        <Search className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="חיפוש שיחות, אנשי קשר..." className="pe-8" />
      </div>
      <div className="flex-1" />
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
