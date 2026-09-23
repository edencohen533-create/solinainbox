"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button variant="outline" size="sm" />}>שינוי סיסמה</DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>שינוי סיסמה — {name}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault(); setBusy(true);
        try {
          const res = await fetch(`/api/settings/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
          if (!res.ok) { toast.error("לא ניתן לשנות סיסמה. נדרשים לפחות 12 תווים וסיסמה אישית"); return; }
          toast.success("הסיסמה עודכנה. נדרשת כניסה מחדש בחשבון זה"); setPassword(""); setOpen(false);
        } catch { toast.error("שינוי הסיסמה נכשל"); } finally { setBusy(false); }
      }}><p className="text-sm text-muted-foreground">לפני חיבור Meta יש להחליף סיסמאות דמו ולבטל משתמשי הדגמה שאינם בשימוש.</p>
      <Input aria-label="סיסמה חדשה" autoComplete="new-password" type="password" minLength={12} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button disabled={busy} type="submit">{busy ? "שומר..." : "שמור סיסמה"}</Button></form>
    </DialogContent></Dialog>;
}
