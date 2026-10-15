"use client";

import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ConsentChoice = "unknown" | "accepted" | "rejected";
type GtagArguments = [string, ...unknown[]];

declare global {
  interface Window {
    dataLayer?: GtagArguments[];
    gtag?: (...args: GtagArguments) => void;
  }
}

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";
const CONSENT_STORAGE_KEY = "snhs-analytics-consent-v1";

function isPublicPage(pathname: string) {
  return pathname === "/" || pathname === "/contact" || pathname === "/privacy" || pathname === "/terms";
}

export function AnalyticsConsent() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<ConsentChoice>("unknown");
  const lastSentPageView = useRef({ path: "", at: 0 });

  useEffect(() => {
    if (!measurementId) return;
    try {
      const saved = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (saved === "accepted" || saved === "rejected") setChoice(saved);
    } catch {
      // Storage can be unavailable in restricted browsers; leave analytics off until the current visit is accepted.
    }
  }, []);

  const sendPublicPageView = useCallback((path: string) => {
    if (!window.gtag || !isPublicPage(path)) return;
    const now = Date.now();
    if (lastSentPageView.current.path === path && now - lastSentPageView.current.at < 1000) return;
    lastSentPageView.current = { path, at: now };
    window.gtag("event", "page_view", {
      page_path: path,
      page_title: document.title,
      page_location: window.location.origin + path
    });
  }, []);

  const onTagReady = useCallback(() => {
    if (!window.dataLayer) window.dataLayer = [];
    if (!window.gtag) {
      window.gtag = (...args: GtagArguments) => { window.dataLayer?.push(args); };
      window.gtag("js", new Date());
      window.gtag("consent", "default", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
      window.gtag("config", measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
    }
    sendPublicPageView(pathname);
  }, [pathname, sendPublicPageView]);

  useEffect(() => {
    if (!window.gtag || choice === "unknown") return;
    const publicTrackingAllowed = choice === "accepted" && isPublicPage(pathname);
    window.gtag("consent", "update", {
      analytics_storage: publicTrackingAllowed ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    if (publicTrackingAllowed) sendPublicPageView(pathname);
  }, [choice, pathname, sendPublicPageView]);

  function openChoices() {
    setChoice("unknown");
    if (window.gtag) {
      window.gtag("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
    }
  }

  function choose(next: Exclude<ConsentChoice, "unknown">) {
    setChoice(next);
    try { window.localStorage.setItem(CONSENT_STORAGE_KEY, next); } catch { /* Continue for this visit if storage is blocked. */ }
    if (window.gtag) {
      window.gtag("consent", "update", {
        analytics_storage: next === "accepted" ? "granted" : "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
    }
  }

  return (
    <>
      {measurementId && choice === "accepted" && isPublicPage(pathname) ? (
        <Script
          id="google-analytics-loader"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
          strategy="afterInteractive"
          onReady={onTagReady}
        />
      ) : null}
      {measurementId && choice !== "unknown" && isPublicPage(pathname) ? (
        <button type="button" className="analytics-manage" onClick={openChoices}>Privacy choices</button>
      ) : null}
      {measurementId && choice === "unknown" && isPublicPage(pathname) ? (
        <aside className="analytics-consent" aria-label="Analytics preferences">
          <div>
            <strong>Privacy choices</strong>
            <p>Optional analytics helps understand visits to public pages. It stays off unless you accept. Read our <Link href="/privacy">Privacy Policy</Link>.</p>
          </div>
          <div className="analytics-consent-actions">
            <button type="button" className="analytics-reject" onClick={() => choose("rejected")}>Reject</button>
            <button type="button" className="analytics-accept" onClick={() => choose("accepted")}>Accept analytics</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
