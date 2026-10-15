"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PortalHeader } from "@/components/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type FeedbackStatus = "new" | "in_review" | "resolved";
type ParentFeedback = {
  id: string;
  studentName: string;
  guardianName: string;
  message: string;
  subjectName: string | null;
  status: FeedbackStatus;
  privacyNoticeVersion: string;
  consentedAt: string;
  createdAt: string;
  updatedAt: string;
  section: { grade_level: number; section_name: string; academic_year: string } | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ParentFeedbackInbox() {
  const [messages, setMessages] = useState<ParentFeedback[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadInbox = useCallback(async (token: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/parent-feedback", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Parent feedback could not be loaded.");
      setMessages(payload.messages ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Parent feedback could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { if (active) { setError("Teacher sign-in is not configured yet."); setLoading(false); } return; }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      const token = data.session?.access_token;
      if (sessionError || !token) { setError("Sign in through the teacher portal to view feedback."); setLoading(false); return; }
      setAccessToken(token);
      await loadInbox(token);
    }
    void init();
    return () => { active = false; };
  }, [loadInbox]);

  async function updateStatus(item: ParentFeedback, status: FeedbackStatus) {
    if (!accessToken) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/parent-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        body: JSON.stringify({ id: item.id, status })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Feedback status could not be updated.");
      setMessages((current) => current.map((message) => message.id === item.id ? { ...message, status: payload.status } : message));
      setNotice("Feedback status updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback status could not be updated.");
    } finally { setBusyId(""); }
  }

  return (
    <main className="portal-page inbox-page">
      <div className="portal-shell">
        <PortalHeader breadcrumbs={[{ label: "Home", href: "/" }, { label: "Teacher portal", href: "/teacher" }, { label: "Parent feedback" }]} />
        <section className="inbox-heading">
          <span className="section-kicker">CLASS ADVISER MESSAGES</span>
          <h1>Parent <em>feedback</em></h1>
          <p>Messages are routed to the teacher who owns the student’s registered class section. Only that teacher can open and update the assigned feedback. Personal message content is encrypted in the database.</p>
          <div className="inbox-actions"><Link href="/teacher" className="button button-outline">← Back to teacher portal</Link><button type="button" className="button button-outline" onClick={() => accessToken && void loadInbox(accessToken)} disabled={loading || !accessToken}>Refresh inbox</button></div>
        </section>
        {error && <p className="form-alert error-alert" role="alert">{error}{error.includes("Sign in") ? <> <Link href="/teacher">Open teacher portal</Link>.</> : null}</p>}
        {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
        {loading ? <div className="dashboard-loading"><span className="spinner" /> Loading parent feedback…</div> : !error && !messages.length ? <section className="inbox-empty"><h2>No parent feedback yet</h2><p>Feedback sent from a verified student grade report will appear here when it is addressed to your class section.</p></section> : (
          <section className="inbox-list" aria-label="Parent feedback messages">
            {messages.map((item) => (
              <article className="inbox-message" key={item.id}>
                <div className="inbox-message-top"><div><span className={`inbox-status status-${item.status}`}>{item.status.replace("_", " ")}</span><h2>{item.subjectName ? `Grade feedback: ${item.subjectName}` : "General grade feedback"}</h2></div><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div>
                <div className="inbox-sender"><strong>{item.guardianName}</strong><span>Parent/guardian of {item.studentName}</span>{item.section && <span>Grade {item.section.grade_level} — {item.section.section_name} · {item.section.academic_year}</span>}</div>
                <p className="inbox-message-body">{item.message}</p>
                <div className="inbox-message-footer"><small>Privacy notice {item.privacyNoticeVersion} · consent recorded {formatDate(item.consentedAt)}</small><div>
                  {item.status !== "new" && <button type="button" className="button button-outline" onClick={() => void updateStatus(item, "new")} disabled={busyId === item.id}>Mark new</button>}
                  {item.status !== "in_review" && <button type="button" className="button button-outline" onClick={() => void updateStatus(item, "in_review")} disabled={busyId === item.id}>In review</button>}
                  {item.status !== "resolved" && <button type="button" className="button button-primary" onClick={() => void updateStatus(item, "resolved")} disabled={busyId === item.id}>{busyId === item.id ? "Saving…" : "Mark resolved"}</button>}
                </div></div>
              </article>
            ))}
          </section>
        )}
        <footer className="portal-footer"><span>© {new Date().getFullYear()} SNHS Gradebook</span><span>Private class-adviser feedback</span><nav className="portal-legal-links" aria-label="Footer links"><Link href="/teacher">Teacher portal</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
      </div>
    </main>
  );
}
