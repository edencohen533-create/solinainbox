"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function MessageComposer({
  conversationId,
  disabled,
  disabledReason,
}: {
  conversationId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSend() {
    if (!value.trim() || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value }),
      });
      if (!res.ok) {
        toast.error("שליחת ההודעה נכשלה");
        return;
      }
      setValue("");
    } finally {
      setIsSending(false);
    }
  }

  if (disabled) {
    return (
      <div className="border-t bg-muted/40 p-3 text-center text-sm text-muted-foreground">
        {disabledReason ?? "לא ניתן לשלוח הודעה חופשית כרגע — יש להשתמש בתבנית מאושרת."}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 border-t p-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="הקלד הודעה..."
        rows={2}
        className="resize-none"
      />
      <Button size="icon" onClick={handleSend} disabled={isSending || !value.trim()} aria-label="שלח">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
