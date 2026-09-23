import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { contactSchema } from "@/lib/validation/contact";
import { getContact, updateContact, DuplicateContactError, InvalidPhoneError } from "@/server/services/contact-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const contact = await getContact(id, session);
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ contact });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = contactSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const contact = await updateContact(id, parsed.data, session.user.id, session);
    return NextResponse.json({ contact });
  } catch (error) {
    if (error instanceof DuplicateContactError) {
      return NextResponse.json({ error: "מספר הטלפון כבר קיים במערכת" }, { status: 409 });
    }
    if (error instanceof InvalidPhoneError) {
      return NextResponse.json({ error: "מספר טלפון לא תקין" }, { status: 400 });
    }
    if ((error as { code?: string }).code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
