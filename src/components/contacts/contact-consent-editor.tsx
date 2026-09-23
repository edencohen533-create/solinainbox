"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
export function ContactConsentEditor({ contactId, initialStatus }: { contactId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus), [busy, setBusy] = useState(false);
  const router = useRouter();
  return <div className="flex flex-wrap items-end gap-2"><label className="text-sm">הסכמה לדיוור<select aria-label="עדכון הסכמה לדיוור" className="mt-1 block rounded border p-2" value={status} onChange={(event) => setStatus(event.target.value)}><option value="UNKNOWN">לא ידוע</option><option value="OPTED_IN">קיימת הסכמה לקבלת דיוור</option><option value="OPTED_OUT">סירב לקבל הודעות</option></select></label>
    <Button variant="outline" disabled={busy || status === initialStatus} onClick={async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/contacts/${contactId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consentStatus: status }) });
        if (!response.ok) throw new Error();
        toast.success("ההסכמה עודכנה"); router.refresh();
      } catch { toast.error("לא ניתן לעדכן הסכמה"); } finally { setBusy(false); }
    }}>שמור הסכמה</Button><p className="w-full text-xs text-muted-foreground">יש לסמן הסכמה רק אם הלקוח נתן אותה. בקשת הסרה בוואטסאפ מעדכנת את הסטטוס אוטומטית.</p>
  </div>;
}
