import { auth } from "@/lib/auth";
import { listSendableTemplates } from "@/server/services/template-service";
export async function GET() {
  if (!(await auth())?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ templates: await listSendableTemplates() });
}
