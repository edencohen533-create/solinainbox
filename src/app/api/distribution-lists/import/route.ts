import { z } from "zod";
import { campaignActor } from "@/lib/campaign-auth";
import { parseContactCsv } from "@/lib/contact-csv";
import { prisma } from "@/lib/prisma";
const schema = z.object({ name: z.string().trim().min(1).max(120), csv: z.string().max(1_000_000) });
export async function POST(request: Request) {
  if (!await campaignActor()) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "שם רשימה וקובץ CSV נדרשים (עד 1MB)" }, { status: 400 });
  let parsed: ReturnType<typeof parseContactCsv>;
  try { parsed = parseContactCsv(input.data.csv); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const result = await prisma.$transaction(async (tx) => {
    // Never re-subscribe or overwrite existing contacts on import.
    const created = await tx.contact.createMany({ data: parsed.contacts.map((contact) => ({ ...contact, source: "csv" })), skipDuplicates: true });
    const contacts = await tx.contact.findMany({ where: { phone: { in: parsed.contacts.map((c) => c.phone) } }, select: { id: true } });
    const list = await tx.distributionList.create({ data: { name: input.data.name, members: { create: contacts.map((c) => ({ contactId: c.id })) } } });
    return { list, created: created.count, existing: contacts.length - created.count, duplicateRows: parsed.duplicateRows };
  }, { timeout: 30000 });
  return Response.json(result, { status: 201 });
}
