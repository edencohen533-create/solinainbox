"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Rule {
  id: string;
  name: string;
  trigger: string;
  actionType: string;
  isActive: boolean;
}

const TRIGGER_LABELS: Record<string, string> = {
  NEW_INBOUND_MESSAGE: "הודעה נכנסת חדשה",
  NEW_CONVERSATION: "שיחה חדשה",
  TAG_ADDED: "תגית נוספה",
  CONVERSATION_UNASSIGNED: "שיחה לא משויכת",
  NO_REPLY_TIMEOUT: "אין מענה בזמן",
};

const ACTION_LABELS: Record<string, string> = {
  ASSIGN_AGENT: "שיוך לנציג",
  ADD_TAG: "הוספת תגית",
  CHANGE_STATUS: "שינוי סטטוס",
  ADD_INTERNAL_NOTE: "הוספת הערה",
  SEND_CANNED_REPLY: "תגובה מוכנה",
  SEND_TEMPLATE: "שליחת תבנית",
};

export function RuleList({ rules }: { rules: Rule[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function toggleActive(id: string, isActive: boolean) {
    setPending(id);
    try {
      const res = await fetch(`/api/automations/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        toast.error("שגיאה בעדכון החוק");
        return;
      }
      router.refresh();
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
            <TableHead>טריגר</TableHead>
            <TableHead>פעולה</TableHead>
            <TableHead>פעיל</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell className="font-medium">{rule.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{TRIGGER_LABELS[rule.trigger] ?? rule.trigger}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{ACTION_LABELS[rule.actionType] ?? rule.actionType}</Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={rule.isActive}
                  disabled={pending === rule.id}
                  onCheckedChange={(checked) => toggleActive(rule.id, checked)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
