import { listTemplates } from "@/server/services/template-service";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TemplatePreviewDialog } from "@/components/templates/template-preview-dialog";
import { EmptyState } from "@/components/shared/empty-state";

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "שיווק",
  UTILITY: "שירות",
  AUTHENTICATION: "אימות",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "טיוטה",
  PENDING_APPROVAL: "ממתין לאישור",
  APPROVED: "מאושר",
  REJECTED: "נדחה",
};

export default async function TemplatesPage() {
  const templates = await listTemplates();

  if (templates.length === 0) {
    return <EmptyState title="אין תבניות עדיין" />;
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">תבניות הודעה</h1>
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>שם</TableHead>
              <TableHead>שפה</TableHead>
              <TableHead>קטגוריה</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>תוכן</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>{template.language === "he" ? "עברית" : template.language}</TableCell>
                <TableCell>
                  <Badge variant="outline">{CATEGORY_LABELS[template.category] ?? template.category}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{STATUS_LABELS[template.status] ?? template.status}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{template.body}</TableCell>
                <TableCell>
                  <TemplatePreviewDialog name={template.name} body={template.body} variables={template.variables} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
