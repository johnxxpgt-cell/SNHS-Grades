import Link from "next/link";
import { Brand } from "@/components/brand";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default function NotFound() {
  return (
    <>
      <title>Page not found | SNHS Gradebook</title>
      <meta name="description" content="This SNHS Gradebook page could not be found. Return to the school portal home page." />
      <meta name="robots" content="noindex, follow" />
      <main className="public-page not-found-page">
      <div className="public-page-shell">
        <header className="public-page-header"><Brand /><Link href="/" className="back-link">← Back to home</Link></header>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Page not found" }]} />
        <section className="public-page-hero not-found-content">
          <span className="section-kicker">ERROR 404</span>
          <h1>This page could not <em>be found.</em></h1>
          <p>The address may have changed or the page may no longer exist. Use one of the verified destinations below.</p>
          <div className="public-actions"><Link className="button button-primary" href="/">Return home</Link><Link className="button button-outline" href="/student">Student portal</Link><Link className="button button-outline" href="/teacher">Teacher portal</Link></div>
        </section>
        <footer className="public-page-footer"><Brand /><nav aria-label="Footer links"><Link href="/contact">Contact</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav></footer>
      </div>
      </main>
    </>
  );
}
