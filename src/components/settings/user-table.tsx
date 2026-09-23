"use client";

import { ResetPasswordDialog } from "./reset-password-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Ltr } from "@/components/shared/ltr";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "מנהל מערכת",
  MANAGER: "מנהל צוות",
  AGENT: "נציג",
};

export function UserTable({ users: initialUsers, canManage }: { users: UserRow[]; canManage: boolean }) {
  const [users, setUsers] = useState(initialUsers);
  const [pending, setPending] = useState<string | null>(null);

  async function toggleActive(id: string, isActive: boolean) {
    setPending(id);
    // Optimistic update — flip it immediately, roll back only on failure.
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive } : u)));
    try {
      const res = await fetch(`/api/settings/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: !isActive } : u)));
        toast.error("שגיאה בעדכון המשתמש");
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>שם</TableHead>
            <TableHead>אימייל</TableHead>
            <TableHead>תפקיד</TableHead>
            <TableHead>פעיל</TableHead><TableHead>סיסמה</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>
                <Ltr>{user.email}</Ltr>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{ROLE_LABELS[user.role] ?? user.role}</Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={user.isActive}
                  disabled={!canManage || pending === user.id}
                  onCheckedChange={(checked) => toggleActive(user.id, checked)}
                />
              </TableCell>
              <TableCell>{canManage && <ResetPasswordDialog userId={user.id} name={user.name} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
