import type { Metadata } from "next";
import { TeacherPortal } from "@/components/teacher-portal";

export const metadata: Metadata = {
  title: "Teacher portal",
  description: "Teacher sign-in and classroom grade management for SNHS.",
  robots: { index: false, follow: false, nocache: true }
};

export default function TeacherPage() {
  return <TeacherPortal />;
}
