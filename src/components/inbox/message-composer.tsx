"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { renderTemplate, templateParameterKeys } from "@/lib/campaigns";
import type { MessageItem } from "@/types/domain";

type Template = { id: string; name: string; body: string };
export function MessageComposer({ conversationId, disabled, disabledReason, onSent }: {
  conversationId: string; disabled?: boolean; disabledReason?: string; onSent?: (message: MessageItem) => void;
}) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const template = templates?.find((t) => t.id === templateId);
  const canSend = showTemplates ? !!template && templateParameterKeys(template.body).every((key) => variables[key]?.trim()) : !disabled && !!value.trim();

  async function loadTemplates() {
    setShowTemplates(!showTemplates);
    if (templates) return;
    try {
      const response = await fetch("/api/templates");
      if (!response.ok) throw new Error();
      setTemplates((await response.json()).templates);
    } catch { toast.error("טעינת התבניות נכשלה"); setShowTemplates(false); }
  }
  async function handleSend() {
    if (!canSend || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(showTemplates ? { templateId, templateVariables: variables } : { body: value }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(typeof data.error === "string" ? data.error : "שליחת ההודעה נכשלה"); return; }
      if (data.message) onSent?.({ ...data.message, sentByUser: null });
      setValue(""); setTemplateId(""); setVariables({});
    } catch { toast.error("שגיאת תקשורת. יש לבדוק אם ההודעה נשלחה לפני ניסיון נוסף"); }
    finally { setIsSending(false); }
  }
  return <div className="space-y-2 border-t p-3">
    {disabled && <p className="text-sm text-muted-foreground">{disabledReason ?? "חלון המענה הסתיים — יש להשתמש בתבנית מאושרת."}</p>}
    <Button size="sm" variant="outline" onClick={loadTemplates}>{showTemplates ? "סגור תבניות" : "שליחת תבנית מאושרת"}</Button>
    {showTemplates ? <div className="space-y-2">
      <select aria-label="תבנית הודעה" className="w-full rounded-md border bg-background p-2" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVariables({}); }}><option value="">בחר תבנית</option>{templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      {templates?.length === 0 && <p className="text-sm text-muted-foreground">אין תבניות מאושרות לשליחה.</p>}
      {template && <><div className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">{renderTemplate(template.body, variables)}</div>{templateParameterKeys(template.body).map((key) => <Input key={key} aria-label={`משתנה ${key}`} placeholder={`ערך עבור משתנה ${key}`} value={variables[key] ?? ""} onChange={(e) => setVariables({ ...variables, [key]: e.target.value })} maxLength={1024} />)}</>}
    </div> : !disabled && <Textarea value={value} onChange={(e) => setValue(e.target.value)} maxLength={4096} onKeyDown={(e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void handleSend(); }
    }} placeholder="הקלד הודעה..." rows={2} className="resize-none" />}
    {(showTemplates || !disabled) && <Button onClick={handleSend} disabled={isSending || !canSend}><Send className="h-4 w-4" />{isSending ? "שולח..." : "שלח"}</Button>}
  </div>;
}
