"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Confirming your email address…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function finishConfirmation() {
      const params = new URLSearchParams(window.location.search);
      const requestedNext = params.get("next");
      const next = requestedNext === "/teacher" ? requestedNext : "/teacher";
      const description = params.get("error_description");
      if (description) {
        if (active) { setMessage(description); setFailed(true); }
        return;
      }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (active) { setMessage("The teacher portal is not connected to Supabase yet."); setFailed(true); }
        return;
      }
      // getSession waits for the Supabase client to process the confirmation URL,
      // including either an implicit session fragment or a PKCE code.
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        if (active) { setMessage("We couldn’t finish email confirmation. The link may have expired. Return to the teacher portal and try again."); setFailed(true); }
        return;
      }
      const destination = new URL(next, window.location.origin);
      destination.searchParams.set("confirmed", "1");
      window.location.replace(destination.toString());
    }
    void finishConfirmation();
    return () => { active = false; };
  }, []);

  return (
    <main className="portal-page teacher-portal-page">
      <div className="portal-shell">
        <PortalHeader breadcrumbs={[{ label: "Home", href: "/" }, { label: "Teacher portal", href: "/teacher" }, { label: "Account confirmation"}]} />
        <section className="auth-callback-card" aria-live="polite">
          <div className={failed ? "auth-callback-mark failed" : "auth-callback-mark"}>{failed ? "!" : <span className="spinner" />}</div>
          <span className="section-kicker">TEACHER ACCOUNT</span>
          <h1>{failed ? "Confirmation needs attention." : "Finishing your sign-up."}</h1>
          <p>{message}</p>
          {failed && <Link className="button button-primary" href="/teacher">Return to teacher portal</Link>}
        </section>
      </div>
    </main>
  );
}
