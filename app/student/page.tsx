import type { Metadata } from "next";
import { StudentPortal } from "@/components/student-portal";

export const metadata: Metadata = {
  title: "Student portal",
  description: "Secure student grade lookup and class registration for SNHS.",
  robots: { index: false, follow: false, nocache: true }
};

export default function StudentPage() {
  return <StudentPortal />;
}
