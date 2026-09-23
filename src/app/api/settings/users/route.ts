import { Prisma } from "@prisma/client";
import { organizationRequest } from "@/lib/organization-request";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN } from "@/lib/auth-guards";
import { createUserSchema } from "@/lib/validation/user";
import { createUser, DuplicateEmailError } from "@/server/services/user-service";

export const POST = organizationRequest(async function(request: Request) {
  const session = await auth();
  if (!session || !hasRole(session, ROLES_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await createUser(parsed.data, session.user.id);
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateEmailError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      return NextResponse.json({ error: "כתובת האימייל כבר קיימת במערכת" }, { status: 409 });
    }
    throw error;
  }
});
