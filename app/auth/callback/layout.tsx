import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Teacher account confirmation",
  description: "Confirm a teacher account for SNHS Gradebook.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: "/auth/callback" }
};

export default function AuthCallbackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
