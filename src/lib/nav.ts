import { Role } from "@prisma/client";

export interface NavItem {
  href: string;
  label: string;
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "תיבת הודעות" },
  { href: "/inbox?filter=all", label: "כל השיחות" },
  { href: "/inbox?filter=mine", label: "שלי" },
  { href: "/inbox?filter=unassigned", label: "לא משויך" },
  { href: "/inbox?filter=open", label: "פתוח" },
  { href: "/inbox?filter=pending", label: "ממתין" },
  { href: "/inbox?filter=resolved", label: "טופל" },
  { href: "/settings/users", label: "צוות", roles: [Role.ADMIN, Role.MANAGER] },
  { href: "/contacts", label: "אנשי קשר" },
  { href: "/campaigns", label: "קמפיינים ורשימות תפוצה", roles: [Role.ADMIN, Role.MANAGER] },
  { href: "/templates", label: "תבניות" },
  { href: "/automations", label: "אוטומציות" },
  { href: "/analytics", label: "אנליטיקה", roles: [Role.ADMIN, Role.MANAGER] },
  { href: "/settings", label: "הגדרות" },
];
