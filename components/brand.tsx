import Link from "next/link";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand${light ? " brand-light" : ""}`} aria-label="SNHS Gradebook home">
      <span className="brand-mark"><img src="/snhs-logo.webp" alt="" /></span>
      <span className="brand-copy">
        <strong>SNHS</strong>
        <small>GRADEBOOK</small>
      </span>
    </Link>
  );
}

export function PortalHeader({
  backHref = "/",
  backLabel = "Back to home",
  breadcrumbs
}: {
  backHref?: string;
  backLabel?: string;
  breadcrumbs?: BreadcrumbItem[];
}) {
  return (
    <>
      <header className="portal-header">
        <Brand />
        <Link href={backHref} className="back-link"><span aria-hidden="true">←</span> {backLabel}</Link>
      </header>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
    </>
  );
}
