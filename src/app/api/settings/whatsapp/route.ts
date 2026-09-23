import { MetaConnectionError } from "@/server/services/meta-connection-service";
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

  const parsed = metaProviderConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try { await activateMetaProvider(parsed.data, session.user.id); }
  catch (error) {
    if (error instanceof MetaConnectionError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}

export const maxDuration = 60;
