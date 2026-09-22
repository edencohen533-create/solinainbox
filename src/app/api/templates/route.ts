import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET() {
  if (!(await auth())?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ templates: await prisma.template.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" } }) });
}
