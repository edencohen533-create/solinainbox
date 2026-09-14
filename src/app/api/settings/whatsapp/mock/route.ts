import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN } from "@/lib/auth-guards";
import { activateMockProvider } from "@/server/services/provider-credential-service";

export async function POST() {
  const session = await auth();
  if (!session || !hasRole(session, ROLES_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await activateMockProvider(session.user.id);
  return NextResponse.json({ ok: true });
}
