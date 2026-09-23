"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AutomationActionType, AutomationTrigger } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  NEW_INBOUND_MESSAGE: "הודעה נכנסת חדשה",
  NEW_CONVERSATION: "שיחה חדשה",
  TAG_ADDED: "תגית נוספה",
  CONVERSATION_UNASSIGNED: "שיחה לא משויכת",
  NO_REPLY_TIMEOUT: "אין מענה תוך X דקות",
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  ASSIGN_AGENT: "שיוך לנציג",
  ADD_TAG: "הוספת תגית",
  CHANGE_STATUS: "שינוי סטטוס",
  ADD_INTERNAL_NOTE: "הוספת הערה פנימית",
  SEND_CANNED_REPLY: "שליחת תגובה מוכנה",
  SEND_TEMPLATE: "שליחת תבנית",
};

interface Option {
  id: string;
  label: string;
  variables?: string[];
}

export function RuleBuilder({ agents, cannedReplies, templates }: { agents: Option[]; cannedReplies: Option[]; templates: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>(AutomationTrigger.NEW_INBOUND_MESSAGE);
  const [minutes, setMinutes] = useState("30");
  const [tagName, setTagName] = useState("");
  const [actionType, setActionType] = useState<AutomationActionType>(AutomationActionType.ASSIGN_AGENT);
  const [agentId, setAgentId] = useState("");
  const [actionTagName, setActionTagName] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [noteBody, setNoteBody] = useState("");
  const [cannedReplyId, setCannedReplyId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [templateId, setTemplateId] = useState("");

  function buildTriggerConfig(): Record<string, unknown> {
    if (trigger === AutomationTrigger.NO_REPLY_TIMEOUT) return { minutes: Number(minutes) || 30 };
    if (trigger === AutomationTrigger.TAG_ADDED) return tagName ? { tagName } : {};
    return {};
  }

  function buildActionConfig(): Record<string, unknown> {
    switch (actionType) {
      case AutomationActionType.ASSIGN_AGENT:
        return { agentId };
      case AutomationActionType.ADD_TAG:
        return { tagName: actionTagName };
      case AutomationActionType.CHANGE_STATUS:
        return { status };
      case AutomationActionType.ADD_INTERNAL_NOTE:
        return { body: noteBody };
      case AutomationActionType.SEND_CANNED_REPLY:
        return { cannedReplyId };
      case AutomationActionType.SEND_TEMPLATE:
        return { templateId, variables };
      default:
        return {};
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("נא להזין שם לחוק");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          trigger,
          triggerConfig: buildTriggerConfig(),
          actionType,
          actionConfig: buildActionConfig(),
          isActive: true,
        }),
      });
      if (!res.ok) {
        toast.error("שגיאה ביצירת החוק");
        return;
      }
      toast.success("החוק נוצר בהצלחה");
      setOpen(false);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Plus className="h-4 w-4" /> חוק אוטומציה חדש</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>חוק אוטומציה חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>שם החוק</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: שיוך אוטומטי ללקוחות VIP" />
          </div>

          <div className="space-y-1.5">
            <Label>טריגר</Label>
            <Select value={trigger} onValueChange={(v) => v && setTrigger(v as AutomationTrigger)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {trigger === AutomationTrigger.NO_REPLY_TIMEOUT && (
            <div className="space-y-1.5">
              <Label>דקות ללא מענה</Label>
              <Input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          )}
          {trigger === AutomationTrigger.TAG_ADDED && (
            <div className="space-y-1.5">
              <Label>שם התגית (השאר ריק לכל תגית)</Label>
              <Input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="VIP" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>פעולה</Label>
            <Select value={actionType} onValueChange={(v) => v && setActionType(v as AutomationActionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {actionType === AutomationActionType.ASSIGN_AGENT && (
            <div className="space-y-1.5">
              <Label>נציג</Label>
              <Select value={agentId} onValueChange={(v) => v && setAgentId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחר נציג..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {actionType === AutomationActionType.ADD_TAG && (
            <div className="space-y-1.5">
              <Label>שם התגית להוספה</Label>
              <Input value={actionTagName} onChange={(e) => setActionTagName(e.target.value)} />
            </div>
          )}
          {actionType === AutomationActionType.CHANGE_STATUS && (
            <div className="space-y-1.5">
              <Label>סטטוס חדש</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">פתוח</SelectItem>
                  <SelectItem value="PENDING">ממתין</SelectItem>
                  <SelectItem value="RESOLVED">טופל</SelectItem>
                  <SelectItem value="CLOSED">סגור</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {actionType === AutomationActionType.ADD_INTERNAL_NOTE && (
            <div className="space-y-1.5">
              <Label>תוכן ההערה</Label>
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} />
            </div>
          )}
          {actionType === AutomationActionType.SEND_CANNED_REPLY && (
            <div className="space-y-1.5">
              <Label>תגובה מוכנה</Label>
              <Select value={cannedReplyId} onValueChange={(v) => v && setCannedReplyId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחר..." />
                </SelectTrigger>
                <SelectContent>
                  {cannedReplies.map((reply) => (
                    <SelectItem key={reply.id} value={reply.id}>
                      {reply.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {actionType === AutomationActionType.SEND_TEMPLATE && <div className="space-y-2">{templates.find((t) => t.id === templateId)?.variables?.map((key) => <label key={key} className="block text-sm">משתנה {key}<Input value={variables[key] ?? ""} onChange={(e) => setVariables({ ...variables, [key]: e.target.value })} placeholder="ניתן להשתמש ב־{name} לשם הלקוח" maxLength={1024} /></label>)}</div>}
          {actionType === AutomationActionType.SEND_TEMPLATE && (
            <div className="space-y-1.5">
              <Label>תבנית</Label>
              <Select value={templateId} onValueChange={(v) => { if (v) { setTemplateId(v); setVariables({}); } }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחר..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "שומר..." : "צור חוק"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
