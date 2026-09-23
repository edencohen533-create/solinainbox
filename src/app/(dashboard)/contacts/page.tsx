import { auth } from "@/lib/auth";
import { listContacts } from "@/server/services/contact-service";
import { ContactTable } from "@/components/contacts/contact-table";

export default async function ContactsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const contacts = await listContacts(session);
  return <ContactTable key={contacts.map((contact) => contact.id).join(",")} initialContacts={contacts} />;
}
