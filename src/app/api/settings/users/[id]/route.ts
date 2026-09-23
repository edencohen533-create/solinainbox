import { Prisma } from "@prisma/client";
import { organizationRequest } from "@/lib/organization-request";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN } from "@/lib/auth-guards";
import { setUserActive, resetUserPassword, setUserTeam, InvalidTeamError } from "@/server/services/user-service";

const patchSchema = z.union([z.object({ teamId: z.string().min(1).nullable() }).strict(), z.object({ isActive: z.boolean() }).strict(), z.object({ password: z.string().min(12).max(72).refine((value) => value !== "Password123!") }).strict()]);

export const PATCH = organizationRequest(async function(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  try {
    const user = "password" in parsed.data
      ? await resetUserPassword(id, parsed.data.password, session.user.id)
      : "teamId" in parsed.data ? await setUserTeam(id, parsed.data.teamId, session.user.id) : await setUserActive(id, parsed.data.isActive, session.user.id);
    return NextResponse.json({ user: { id: user.id, isActive: user.isActive } });
  } catch (error) {
    if (error instanceof InvalidTeamError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ error: "המשתמש לא נמצא" }, { status: 404 });
    throw error;
  }
});
