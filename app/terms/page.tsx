import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for authorized use of SNHS Gradebook by students, teachers, and visitors.",
  alternates: { canonical: "/terms" },
  openGraph: { title: "SNHS Gradebook Terms of Service", description: "Rules and conditions for using the SNHS Gradebook portal.", url: "/terms", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SNHS Gradebook — Salvacion National High School" }] }
};

const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || "";

export default function TermsPage() {
  return (
    <main className="public-page">
      <div className="public-page-shell legal-shell">
        <header className="public-page-header"><Brand /><Link href="/" className="back-link">← Back to home</Link></header>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Terms of Service" }]} />
        <section className="public-page-hero"><span className="section-kicker">SERVICE TERMS</span><h1>Terms of <em>Service</em></h1><p>Last updated: 15 October 2026</p></section>
        <article className="public-card legal-content">
          <p>These terms govern use of SNHS Gradebook, a portal intended to support Salvacion National High School student grade lookup, teacher classroom records and related communication. The school administration must review and approve these terms before production launch. They do not override education rules, mandatory legal rights or official school-record procedures.</p>
          <h2>1. Authorized use</h2>
          <p>Students should access only their own records. Teachers may use the teacher portal only for authorized school duties and may access only the class records permitted by their account. Do not share PINs, passwords, access tokens, LRNs, screenshots or exported school records with unauthorized people.</p>
          <h2>2. Accurate information and account security</h2>
          <p>Provide accurate details and use the account and credentials assigned to you. Keep passwords and student PINs private, sign out of shared devices, and report suspected unauthorized access to the school. The school may limit access, investigate abuse or correct records according to its policies and applicable law.</p>
          <h2>3. School records</h2>
          <p>The portal displays records entered by authorized teachers. If a grade appears incorrect or incomplete, contact the relevant teacher or school administration for review. A portal display or downloadable report image does not replace an official school document where a signed or formally issued record is required.</p>
          <h2>4. Prohibited activities</h2>
          <p>You must not try to access another person's record, guess credentials, bypass access controls, scrape or redistribute school records, upload malicious content, disrupt service, or use the site unlawfully. The contact form must not be used to submit passwords, PINs, LRNs, or unrelated sensitive information.</p>
          <h2>5. Availability and changes</h2>
          <p>The service may be updated, temporarily unavailable, or changed for security, maintenance or school needs. Reasonable care is taken to protect the information processed, but no website can guarantee uninterrupted availability or absolute security.</p>
          <h2>6. Privacy</h2>
          <p>Use of the portal is subject to the <Link href="/privacy">Privacy Policy</Link>. The school should provide appropriate notices and obtain any consent or authorization required for processing, especially for records concerning minors.</p>
          <h2>7. Responsibility and applicable law</h2>
          <p>Nothing in these terms excludes rights or liabilities that cannot legally be excluded. The service is intended for use in the Philippines and is governed by applicable Philippine law. Any dispute should first be raised with the school administration, without limiting any statutory remedy.</p>
          <h2>8. Contact</h2>
          <p>For questions about the portal, use the <Link href="/contact">contact form</Link>. {privacyEmail ? <>Privacy matters can be directed to <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</> : <>The school must publish its official, monitored privacy contact before the portal is launched in production.</>}</p>
        </article>
        <PublicFooter />
      </div>
    </main>
  );
}

function PublicFooter() {
  return <footer className="public-page-footer"><Brand /><nav aria-label="Footer links"><Link href="/contact">Contact</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav></footer>;
}
