"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PortalHeader } from "@/components/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  privacyNoticeVersion: string;
  consentedAt: string;
  status: "new" | "in_review" | "closed";
  createdAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ContactInbox() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadInbox = useCallback(async (token: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/contact", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The inbox could not be loaded.");
      setMessages(payload.messages ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The inbox could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (active) { setError("Teacher sign-in is not configured yet."); setLoading(false); }
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      const token = data.session?.access_token;
      if (sessionError || !token) {
        setError("Sign in through the teacher portal to access the school contact inbox.");
        setLoading(false);
        return;
      }
      setAccessToken(token);
      await loadInbox(token);
    }
    void init();
    return () => { active = false; };
  }, [loadInbox]);

  async function updateStatus(message: ContactMessage, status: ContactMessage["status"]) {
    if (!accessToken) return;
    setBusyId(message.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        body: JSON.stringify({ id: message.id, status })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The status could not be updated.");
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, status: payload.status } : item));
      setNotice("Inquiry status updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The status could not be updated.");
    } finally {
      setBusyId("");
    }
  }

  async function deleteMessage(message: ContactMessage) {
    if (!accessToken || !window.confirm(`Permanently delete the inquiry “${message.subject}” from ${message.name}? This cannot be undone.`)) return;
    setBusyId(message.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        body: JSON.stringify({ id: message.id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The inquiry could not be deleted.");
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setNotice("Inquiry deleted permanently.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The inquiry could not be deleted.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="portal-page inbox-page">
      <div className="portal-shell">
        <PortalHeader breadcrumbs={[{ label: "Home", href: "/" }, { label: "Teacher portal", href: "/teacher" }, { label: "Contact inbox" }]} />
        <section className="inbox-heading">
          <span className="section-kicker">SCHOOL CONTACT</span>
          <h1>Contact <em>inbox</em></h1>
          <p>Only teacher accounts on the school-approved contact-admin allowlist can read these messages. Personal fields are decrypted by the server only for authorized accounts.</p>
          <div className="inbox-actions"><Link href="/teacher" className="button button-outline">← Back to teacher portal</Link><button type="button" className="button button-outline" onClick={() => accessToken && void loadInbox(accessToken)} disabled={loading || !accessToken}>Refresh inbox</button></div>
        </section>
        {error && <p className="form-alert error-alert" role="alert">{error}{error.includes("Sign in") ? <> <Link href="/teacher">Open teacher portal</Link>.</> : null}</p>}
        {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
        {loading ? <div className="dashboard-loading"><span className="spinner" /> Loading secure inbox…</div> : !error && !messages.length ? <section className="inbox-empty"><h2>No inquiries yet</h2><p>Contact form submissions will appear here after they are received.</p></section> : (
          <section className="inbox-list" aria-label="Contact messages">
            {messages.map((item) => (
              <article className="inbox-message" key={item.id}>
                <div className="inbox-message-top"><div><span className={`inbox-status status-${item.status}`}>{item.status.replace("_", " ")}</span><h2>{item.subject}</h2></div><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div>
                <div className="inbox-sender"><strong>{item.name}</strong><a href={`mailto:${item.email}`}>{item.email}</a></div>
                <p className="inbox-message-body">{item.message}</p>
                <div className="inbox-message-footer"><small>Privacy notice {item.privacyNoticeVersion} · consent recorded {formatDate(item.consentedAt)}</small><div>
                  {item.status !== "new" && <button type="button" className="button button-outline" onClick={() => void updateStatus(item, "new")} disabled={busyId === item.id}>Reopen</button>}
                  {item.status === "new" && <button type="button" className="button button-outline" onClick={() => void updateStatus(item, "in_review")} disabled={busyId === item.id}>Mark in review</button>}
                  {item.status !== "closed" && <button type="button" className="button button-primary" onClick={() => void updateStatus(item, "closed")} disabled={busyId === item.id}>{busyId === item.id ? "Saving…" : "Close inquiry"}</button>}
                  <button type="button" className="button button-outline inbox-delete" onClick={() => void deleteMessage(item)} disabled={busyId === item.id}>{busyId === item.id ? "Processing…" : "Delete permanently"}</button>
                </div></div>
              </article>
            ))}
          </section>
        )}
        <footer className="portal-footer"><span>© {new Date().getFullYear()} SNHS Gradebook</span><span>Private school support messages</span><nav className="portal-legal-links" aria-label="Footer links"><Link href="/">Home</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
      </div>
    </main>
  );
}
