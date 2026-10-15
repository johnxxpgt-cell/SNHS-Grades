import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Brand } from "@/components/brand";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact SNHS Gradebook",
  description: "Send a question about the SNHS Gradebook student or teacher portal.",
  alternates: { canonical: "/contact" },
  openGraph: { title: "Contact SNHS Gradebook", description: "Contact the SNHS Gradebook school portal team.", url: "/contact", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SNHS Gradebook — Salvacion National High School" }] }
};

const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || "";

export default function ContactPage() {
  return (
    <main className="public-page">
      <div className="public-page-shell">
        <header className="public-page-header"><Brand /><Link href="/" className="back-link">← Back to home</Link></header>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact" }]} />
        <section className="public-page-hero">
          <span className="section-kicker">SCHOOL PORTAL SUPPORT</span>
          <h1>How can we <em>help?</em></h1>
          <p>Send a question about the SNHS Gradebook. Do not send grades, passwords, PINs, or learner reference numbers through this general contact form.</p>
        </section>
        {!privacyEmail && <p className="configuration-notice">Production setup required: configure <code>NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL</code> with the school-approved privacy contact before launch.</p>}
        <section className="public-card contact-card">
          <div><span className="section-kicker">CONTACT FORM</span><h2>Send a message</h2><p>Your message is encrypted before it is stored and can only be retrieved through the authenticated, email-allowlisted contact inbox API.</p></div>
          <ContactForm privacyEmail={privacyEmail} />
        </section>
        <PublicFooter />
      </div>
    </main>
  );
}

function PublicFooter() {
  return <footer className="public-page-footer"><Brand /><nav aria-label="Footer links"><Link href="/contact">Contact</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav></footer>;
}
