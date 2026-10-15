/**
 * Resolve the canonical public origin without inventing a project hostname.
 * Set NEXT_PUBLIC_APP_URL explicitly for production/custom domains. On Vercel,
 * fall back to its project production host (or deployment host) when available.
 */
export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercelHost = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || ""
  ).trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  return vercelHost ? `https://${vercelHost}` : "http://localhost:3000";
}
