import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { automationRuleSchema } from "@/lib/validation/automation";

export async function POST(request: Request) {
  const session = await auth();
  if (!hasRole(session, ROLES_ADMIN_MANAGER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = automationRuleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await prisma.automationRule.create({ data: parsed.data });
  return NextResponse.json({ rule }, { status: 201 });
}
