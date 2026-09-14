import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN } from "@/lib/auth-guards";
import { setUserActive } from "@/server/services/user-service";

const patchSchema = z.object({ isActive: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !hasRole(session, ROLES_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await setUserActive(id, parsed.data.isActive, session.user.id);
  return NextResponse.json({ user: { id: user.id, isActive: user.isActive } });
}
