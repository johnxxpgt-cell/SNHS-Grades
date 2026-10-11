import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNHS Gradebook — School records, made clear",
  description: "A secure grade portal for Salvacion National High School students and teachers.",
  applicationName: "SNHS Gradebook",
  referrer: "strict-origin-when-cross-origin",
  icons: { icon: "/snhs-logo.webp" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
