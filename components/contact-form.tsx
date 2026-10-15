"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";

export function ContactForm({ privacyEmail }: { privacyEmail: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name,
          email,
          subject,
          message,
          privacyConsent,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
          website
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Your message could not be sent.");
      setStatus(payload.message || "Thank you. Your message has been received.");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setPrivacyConsent(false);
      setWebsite("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your message could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack contact-form" onSubmit={submit}>
      <label className="field">
        <span>Your name</span>
        <input name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
      </label>
      <label className="field">
        <span>Email address</span>
        <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={254} />
      </label>
      <label className="field">
        <span>Subject</span>
        <input name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={3} maxLength={120} />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea name="message" value={message} onChange={(event) => setMessage(event.target.value)} required minLength={10} maxLength={4000} rows={6} />
      </label>
      <label className="consent-row">
        <input type="checkbox" checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} required />
        <span>I have read the <Link href="/privacy" target="_blank">Privacy Policy</Link> and consent to the processing of my details so the school can respond to this message.</span>
      </label>
      {/* Honeypot: hidden from visual and assistive technology; real visitors leave it empty. */}
      <div className="contact-honeypot" aria-hidden="true">
        <label>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      </div>
      <button className="button button-primary form-submit" type="submit" disabled={busy || !privacyConsent}>
        {busy ? "Sending message…" : "Send message"}
      </button>
      {error && <p className="form-alert error-alert" role="alert">{error}</p>}
      {status && <p className="form-alert success-alert" role="status">{status}</p>}
      <p className="form-description">Do not include passwords, PINs, LRNs, medical details, or other sensitive information in a general inquiry.</p>
      {privacyEmail ? <p className="form-description">Privacy contact: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a></p> : null}
    </form>
  );
}
