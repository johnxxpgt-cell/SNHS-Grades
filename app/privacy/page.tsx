import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How SNHS Gradebook processes and safeguards student, teacher, and contact information.",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "SNHS Gradebook Privacy Policy", description: "Information about school portal data processing and safeguards.", url: "/privacy", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SNHS Gradebook — Salvacion National High School" }] }
};

const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || "";

export default function PrivacyPage() {
  return (
    <main className="public-page">
      <div className="public-page-shell legal-shell">
        <header className="public-page-header"><Brand /><Link href="/" className="back-link">← Back to home</Link></header>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]} />
        <section className="public-page-hero"><span className="section-kicker">DATA PROTECTION</span><h1>Privacy <em>Policy</em></h1><p>Last updated: 15 October 2026</p></section>
        {!privacyEmail && <p className="configuration-notice">Before production use, the school must set <code>NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL</code> to an official monitored privacy contact and confirm the responsible Personal Information Controller.</p>}
        <article className="public-card legal-content">
          <p>This notice explains how SNHS Gradebook handles personal information when students look up or register school records, teachers manage classroom records, or visitors submit a general inquiry. It is written for the Salvacion National High School portal and should be reviewed and formally approved by the responsible school/DepEd privacy officer before launch. It is not a certification of legal compliance.</p>

          <h2>1. Who is responsible?</h2>
          <p>Service operator: Salvacion National High School (SNHS), Busuanga, Palawan. The school administration and the responsible Department of Education unit must confirm the legally correct Personal Information Controller designation and publish its official address and privacy contact. {privacyEmail ? <>For privacy inquiries, email <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</> : <>Until the official contact is configured, contact the school administration through its verified official channel. The portal should not be launched as a production service until a monitored privacy contact is published.</>}</p>

          <h2>2. Information the portal processes</h2>
          <ul>
            <li><strong>Student account and identity details:</strong> name, Learner Reference Number (LRN) used to verify access, date of birth, optional gender and profile photo, class section, and a private PIN credential.</li>
            <li><strong>School records:</strong> subject grades, assessment results, teacher comments, and the associated class/academic-year information.</li>
            <li><strong>Teacher account details:</strong> name, school email address, optional gender and photo, authentication/session information, and classroom records entered by the teacher.</li>
            <li><strong>Contact inquiries:</strong> name, email address, subject, message, consent version and timestamp.</li>
            <li><strong>Security data:</strong> pseudonymous keyed digests used to limit repeated requests. The application does not intentionally log submitted LRN/PIN form values.</li>
          </ul>

          <h2>3. Why information is processed</h2>
          <p>Information is used to register a student in a teacher-created class, verify a grade lookup, display school records to the appropriate student, allow teachers to manage their own class roster, secure the service against abuse, respond to inquiries, maintain records of privacy acknowledgements, and meet applicable school-record and legal obligations. Optional analytics may be used to understand use of the public website only after a visitor accepts analytics cookies.</p>
          <p>The responsible controller must document the applicable lawful basis for each processing purpose, including any school/public-function or legal-obligation basis. A checkbox is not a substitute for identifying the lawful basis required by law.</p>

          <h2>4. How information is safeguarded</h2>
          <ul>
            <li>Student LRNs and access proofs are represented in the application database by keyed HMAC digests; PINs are stored as keyed digests rather than plain text.</li>
            <li>Birthdays and contact-form fields are encrypted by the application with AES-256-GCM before database storage.</li>
            <li>Profile photos are converted to WebP and stored in a private Supabase Storage bucket; access links are time-limited.</li>
            <li>Server-only Supabase keys and encryption keys must be stored in the hosting provider's encrypted environment-variable manager, never in source code or `NEXT_PUBLIC_` variables.</li>
            <li>Teacher access relies on Supabase authentication and row-level security. Student lookups and registrations are rate-limited.</li>
          </ul>
          <p>These safeguards reduce risk but cannot guarantee that a system is immune from every attack. The school must also maintain least-privilege access, backups, updates, incident handling, staff confidentiality and security procedures. Names and academic records currently remain readable to authorized database operations, so field-level encryption for these existing records would require a separate carefully tested architecture and migration.</p>

          <h2>5. Service providers and disclosures</h2>
          <p>The app uses Supabase for database, authentication and private file storage and Vercel for application hosting. If enabled, Google Analytics may receive public-page usage data after analytics consent. These providers process data under their own terms and technical configuration. The school must verify service regions, data-processing terms, account access, and any cross-border transfer requirements before production. Personal information should not be disclosed to others except as authorized by the data subject, required or permitted by law, or necessary for the declared school service with appropriate safeguards.</p>

          <h2>6. Retention and deletion</h2>
          <p>Official school records must be retained and disposed of according to applicable education-record rules, approved school retention schedules and legal obligations. Contact inquiries should be reviewed periodically and deleted when no longer needed. The 12-month period after closure is a proposed operational target only, not an automated deletion guarantee; this version of the portal has no automatic contact-retention job. Authorized contact administrators can permanently delete inquiries in the restricted inbox, and the school must establish and document a regular deletion review or scheduled cleanup process before production launch. Official school records require their own approved retention schedule. Security-rate-limit records are purged by the database function after one day. The controller must approve specific schedules and ensure backups follow them.</p>

          <h2>7. Rights and requests</h2>
          <p>Subject to applicable law and any lawful exceptions, data subjects may request information about processing, access to their personal information, correction of inaccurate records, objection, erasure or blocking where appropriate, data portability where applicable, and may lodge a complaint with the National Privacy Commission. Requests should be submitted to the school privacy contact above. The school may need to verify identity or authority before acting, particularly for student records and requests involving minors.</p>

          <h2>8. Children and guardian authority</h2>
          <p>The portal may process information about minors. A person submitting a student registration must be the student or have appropriate authority to do so; where required, a parent or legal guardian should complete or authorize the process. The school must determine the appropriate notice, lawful basis and guardian-consent procedure for its student population before launch.</p>

          <h2>9. Analytics preferences</h2>
          <p>Google Analytics tracking is not loaded until a visitor affirmatively accepts analytics. Rejecting analytics does not prevent use of the school portals. Visitors may clear the site's analytics-consent preference in browser storage to be asked again. If analytics is not configured, the consent notice and analytics tracking remain inactive.</p>

          <h2>10. Changes to this notice</h2>
          <p>This notice may be updated as the service, applicable requirements or safeguards change. Material changes should be made available before the changed processing begins. The school must preserve the appropriate notice version and supporting consent/acknowledgement records.</p>
          <p>Official reference: <a href="https://privacy.gov.ph/data-privacy-act-/" target="_blank" rel="noreferrer">Republic Act No. 10173 — Data Privacy Act of 2012 (National Privacy Commission)</a>.</p>
        </article>
        <PublicFooter />
      </div>
    </main>
  );
}

function PublicFooter() {
  return <footer className="public-page-footer"><Brand /><nav aria-label="Footer links"><Link href="/contact">Contact</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav></footer>;
}
