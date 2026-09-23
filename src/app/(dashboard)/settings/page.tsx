import { organizationRequest } from "@/lib/organization-request";
import Link from "next/link";
import { Users, MessageSquareText, Zap, Radio, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsLink {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  roles?: import("@prisma/client").Role[];
}

export default organizationRequest(async function SettingsPage() {
  const session = await auth();

  const links: SettingsLink[] = [
    {
      href: "/settings/users",
      icon: Users,
      title: "ניהול צוות",
      description: "הוספת משתמשים, שינוי תפקידים והפעלה/השבתה",
      roles: ROLES_ADMIN_MANAGER,
    },
    {
      href: "/templates",
      icon: MessageSquareText,
      title: "תבניות הודעה",
      description: "ניהול תבניות מאושרות לשליחה מחוץ לחלון 24 השעות",
    },
    {
      href: "/automations",
      icon: Zap,
      title: "אוטומציות",
      description: "חוקים אוטומטיים לשיוך, תיוג ומענה",
    },
    {
      href: "/settings/whatsapp",
      icon: Radio,
      title: "חיבור וואטסאפ",
      description: "הגדרת ספק וואטסאפ אמיתי (Meta Cloud API) או שימוש בספק המדומה",
      roles: ROLES_ADMIN,
    },
    {
      href: "/settings/demo-simulator",
      icon: Sparkles,
      title: "סימולטור וואטסאפ (Demo)",
      description: "שליחת הודעה נכנסת מדומה לבדיקת התיבה בזמן אמת",
      roles: ROLES_ADMIN_MANAGER,
    },
  ];

  const visibleLinks = links.filter((link) => !link.roles || hasRole(session, link.roles));

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold">הגדרות</h1>
      <p className="mb-6 text-sm text-muted-foreground">ניהול הצוות, החיבורים והתצורה של Solina Inbox</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
              <CardHeader>
                <link.icon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
});
