import { listContacts } from "@/server/services/contact-service";
import { ContactTable } from "@/components/contacts/contact-table";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return <ContactTable initialContacts={contacts} />;
}
