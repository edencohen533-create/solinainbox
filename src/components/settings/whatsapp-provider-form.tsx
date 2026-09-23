"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Ltr } from "@/components/shared/ltr";

interface Summary {
  provider: string;
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  accessTokenMasked?: string | null;
  hasAppSecret?: boolean;
}

export function WhatsAppProviderForm({ initialSummary, webhookUrl }: { initialSummary: Summary; webhookUrl: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [businessAccountId, setBusinessAccountId] = useState(initialSummary.businessAccountId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState(initialSummary.phoneNumberId ?? "");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const isMetaActive = summary.provider === "meta_whatsapp_cloud_api";

  async function handleActivateMeta() {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, phoneNumberId, businessAccountId: businessAccountId || undefined, webhookVerifyToken, appSecret: appSecret || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(typeof data?.error === "string" ? data.error : "שגיאה בהפעלת החיבור");
        return;
      }
      toast.success("חיבור Meta WhatsApp הופעל");
      setSummary({ provider: "meta_whatsapp_cloud_api", phoneNumberId, accessTokenMasked: "••••", hasAppSecret: Boolean(appSecret) });
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSwitchToMock() {
    setIsSwitching(true);
    try {
      const res = await fetch("/api/settings/whatsapp/mock", { method: "POST" });
      if (!res.ok) {
        toast.error("שגיאה במעבר לספק המדומה");
        return;
      }
      toast.success("עברת לספק המדומה (Mock)");
      setSummary({ provider: "mock" });
      router.refresh();
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">ספק פעיל כרגע:</span>
        <Badge variant={isMetaActive ? "default" : "secondary"}>
          {isMetaActive ? "Meta WhatsApp Cloud API" : "ספק מדומה (Mock)"}
        </Badge>
        {isMetaActive && (
          <Button variant="ghost" size="sm" onClick={handleSwitchToMock} disabled={isSwitching}>
            {isSwitching ? "עובר..." : "חזור לספק המדומה"}
          </Button>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Webhook Callback URL</Label>
        <p className="text-xs text-muted-foreground">
          הדבק כתובת זו ב-Meta App Dashboard תחת WhatsApp → Configuration → Webhook, יחד עם ה-Verify Token שתגדיר למטה.
        </p>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <Ltr>{webhookUrl}</Ltr>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-sm font-medium">חיבור Meta WhatsApp Cloud API</h2>

        {isMetaActive && (
          <p className="text-xs text-muted-foreground">
            מוגדר כרגע: Phone Number ID <Ltr className="inline">{summary.phoneNumberId}</Ltr>, Access Token{" "}
            <Ltr className="inline">{summary.accessTokenMasked}</Ltr>
            {summary.hasAppSecret ? ", App Secret מוגדר" : ""}. מלא שוב את השדות למטה כדי לעדכן.
          </p>
        )}

        <div className="space-y-1.5">
          <Label>Phone Number ID</Label>
          <Input dir="ltr" className="text-left" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp Business Account ID (לסנכרון תבניות)</Label>
          <Input dir="ltr" className="text-left" value={businessAccountId} onChange={(e) => setBusinessAccountId(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Access Token</Label>
          <Input dir="ltr" className="text-left" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Webhook Verify Token</Label>
          <Input
            dir="ltr"
            className="text-left"
            value={webhookVerifyToken}
            onChange={(e) => setWebhookVerifyToken(e.target.value)}
            placeholder="מחרוזת שתבחר בעצמך, זהה למה שתכניס ב-Meta"
          />
        </div>
        <div className="space-y-1.5">
          <Label>App Secret (חובה, לאימות חתימת webhook)</Label>
          <Input dir="ltr" className="text-left" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
        </div>

        <Button onClick={handleActivateMeta} disabled={isSubmitting || !accessToken || !phoneNumberId || !webhookVerifyToken || !appSecret}>
          {isSubmitting ? "מפעיל..." : "שמור והפעל"}
        </Button>
      </div>
    </div>
  );
}
