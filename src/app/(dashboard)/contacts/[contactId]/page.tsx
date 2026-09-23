import { organizationRequest } from "@/lib/organization-request";
import { ContactDetailsEditor } from "@/components/contacts/contact-details-editor";
import { prisma } from "@/lib/prisma";
import { ContactConsentEditor } from "@/components/contacts/contact-consent-editor";
import { auth } from "@/lib/auth";
import { StartConversationButton } from "@/components/contacts/start-conversation-button";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getContact } from "@/server/services/contact-service";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/shared/ltr";
import { Separator } from "@/components/ui/separator";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "פתוח",
  PENDING: "ממתין",
  RESOLVED: "טופל",
  CLOSED: "סגור",
};

const CONSENT_LABELS: Record<string, string> = {
  OPTED_IN: "הסכים לקבל הודעות",
  OPTED_OUT: "סירב לקבל הודעות",
  UNKNOWN: "לא ידוע",
};

export default organizationRequest(async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const session = await auth();
  if (!session?.user) notFound();
  const contact = await getContact(contactId, session);

  if (!contact) {
    notFound();
  }

  const tags = await prisma.tag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{contact.name}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <Ltr>{contact.phone}</Ltr>
          {contact.email && <Ltr>{contact.email}</Ltr>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{CONSENT_LABELS[contact.consentStatus] ?? contact.consentStatus}</Badge>
        {contact.tags.map(({ tag }) => (
          <Badge key={tag.id} variant="outline">
            {tag.name}
          </Badge>
        ))}
      </div>

      {contact.customFields.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">שדות מותאמים</h2>
          <div className="space-y-1 text-sm">
            {contact.customFields.map((field) => (
              <div key={field.key} className="flex justify-between rounded-md border px-3 py-1.5">
                <span className="text-muted-foreground">{field.key}</span>
                <span>{field.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ContactDetailsEditor key={`${contact.id}:${contact.updatedAt.toISOString()}`} contact={contact} tags={tags} />
      <ContactConsentEditor key={contact.id} contactId={contact.id} initialStatus={contact.consentStatus} initialBlocked={contact.isBlocked} />
      <StartConversationButton contactId={contact.id} disabled={contact.consentStatus === "OPTED_OUT"} />
      <Separator />

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">שיחות קודמות</h2>
        {contact.conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין שיחות עדיין</p>
        ) : (
          <div className="space-y-1">
            {contact.conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/inbox/${conversation.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span>{new Date(conversation.createdAt).toLocaleDateString("he-IL")}</span>
                <Badge variant="outline">{STATUS_LABELS[conversation.status]}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">הערות פנימיות</h2>
        {contact.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין הערות</p>
        ) : (
          <div className="space-y-2">
            {contact.notes.map((note) => (
              <div key={note.id} className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950">
                <div className="mb-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">{note.author.name}</div>
                {note.body}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
