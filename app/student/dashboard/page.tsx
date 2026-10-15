import type { Metadata } from "next";
import { StudentGradeDashboard } from "@/components/student-grade-dashboard";

export const metadata: Metadata = {
  title: "My grades",
  description: "Private student grade dashboard for SNHS.",
  robots: { index: false, follow: false, nocache: true }
};

export default function StudentDashboardPage() {
  return <StudentGradeDashboard />;
}
