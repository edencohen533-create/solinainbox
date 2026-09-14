import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN } from "@/lib/auth-guards";
import { metaProviderConfigSchema } from "@/lib/validation/provider";
import { activateMetaProvider, getActiveProviderSummary } from "@/server/services/provider-credential-service";

export async function GET() {
  const session = await auth();
  if (!session || !hasRole(session, ROLES_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await getActiveProviderSummary();
  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || !hasRole(session, ROLES_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = metaProviderConfigSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await activateMetaProvider(parsed.data, session.user.id);
  return NextResponse.json({ ok: true });
}
