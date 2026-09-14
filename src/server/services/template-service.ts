import { prisma } from "@/lib/prisma";

export async function listTemplates() {
  return prisma.template.findMany({ orderBy: { createdAt: "asc" } });
}
