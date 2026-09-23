import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN } from "@/lib/auth-guards";
import { setUserActive, resetUserPassword } from "@/server/services/user-service";

const patchSchema = z.union([z.object({ isActive: z.boolean() }).strict(), z.object({ password: z.string().min(12).max(72).refine((value) => value !== "Password123!") }).strict()]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !hasRole(session, ROLES_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if ("isActive" in parsed.data && !parsed.data.isActive && id === session.user.id) return NextResponse.json({ error: "לא ניתן להשבית את החשבון שלך" }, { status: 409 });
  const user = "password" in parsed.data
    ? await resetUserPassword(id, parsed.data.password, session.user.id)
    : await setUserActive(id, parsed.data.isActive, session.user.id);
  return NextResponse.json({ user: { id: user.id, isActive: user.isActive } });
}
