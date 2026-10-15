import type { Metadata } from "next";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const appUrl = getSiteUrl();
const siteDescription = "A student grade portal for Salvacion National High School students and teachers in Busuanga, Palawan.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "SNHS Gradebook | Salvacion National High School",
    template: "%s | SNHS Gradebook"
  },
  description: siteDescription,
  applicationName: "SNHS Gradebook",
  referrer: "strict-origin-when-cross-origin",
  icons: { icon: "/snhs-logo.webp" },
  openGraph: {
    type: "website",
    siteName: "SNHS Gradebook",
    locale: "en_PH",
    title: "SNHS Gradebook | Salvacion National High School",
    description: siteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SNHS Gradebook — Salvacion National High School" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "SNHS Gradebook | Salvacion National High School",
    description: siteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SNHS Gradebook — Salvacion National High School" }]
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {})
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "Salvacion National High School",
  alternateName: "SNHS",
  url: appUrl,
  logo: `${appUrl}/snhs-logo.webp`,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Busuanga",
    addressRegion: "Palawan",
    addressCountry: "PH"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-PH">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }}
        />
        {children}
        <AnalyticsConsent />
      </body>
    </html>
  );
}
