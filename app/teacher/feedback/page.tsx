import type { Metadata } from "next";
import { ParentFeedbackInbox } from "@/components/parent-feedback-inbox";

export const metadata: Metadata = {
  title: "Parent Feedback | Teacher Portal",
  description: "Private parent and guardian feedback assigned to a class adviser.",
  robots: { index: false, follow: false, nocache: true }
};

export default function ParentFeedbackPage() {
  return <ParentFeedbackInbox />;
}
