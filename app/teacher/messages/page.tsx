import type { Metadata } from "next";
import { ContactInbox } from "@/components/contact-inbox";

export const metadata: Metadata = {
  title: "School contact inbox",
  description: "Restricted school contact inbox for authorized SNHS administrators.",
  robots: { index: false, follow: false, nocache: true }
};

export default function ContactInboxPage() {
  return <ContactInbox />;
}
