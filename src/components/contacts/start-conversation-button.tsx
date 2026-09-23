"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StartConversationButton({ contactId, disabled }: { contactId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId }) });
      const data = await response.json();
      if (!response.ok) { toast.error(data.error || "פתיחת השיחה נכשלה"); return; }
      router.push(`/inbox/${data.conversation.id}`);
    } catch { toast.error("פתיחת השיחה נכשלה"); }
    finally { setBusy(false); }
  }
  return <Button onClick={start} disabled={busy || disabled}>{busy ? "פותח..." : "פתח שיחה ושייך לנציג"}</Button>;
}
