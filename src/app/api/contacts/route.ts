import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { contactSchema } from "@/lib/validation/contact";
import { createContact, listContacts, DuplicateContactError, InvalidPhoneError } from "@/server/services/contact-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const contacts = await listContacts(search);
  return NextResponse.json({ contacts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = contactSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const contact = await createContact(parsed.data, session.user.id);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateContactError) {
      return NextResponse.json({ error: "מספר הטלפון כבר קיים במערכת" }, { status: 409 });
    }
    if (error instanceof InvalidPhoneError) {
      return NextResponse.json({ error: "מספר טלפון לא תקין" }, { status: 400 });
    }
    throw error;
  }
}
