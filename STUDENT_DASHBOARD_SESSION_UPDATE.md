# Student Dashboard and Session Update

## User-facing changes

- Successful student verification redirects to `/student/dashboard`.
- The dashboard identifies the student through a signed, HTTP-only cookie; no LRN, PIN, or student ID is placed in the URL.
- Returning to `/student` while a session is active redirects back to the dashboard.
- The dashboard survives refreshes and renews the session for up to 30 days of continued activity.
- The Log out button clears both the student session and the short-lived feedback ticket.
- Subject grades and assessment scores use native expandable sections. The subject grades section opens by default; assessment details and parent/guardian feedback are collapsed by default.
- On mobile, table rows become labeled cards to avoid horizontal scrolling.
- Parent/guardian feedback works with the active student session as well as the short-lived feedback ticket.

## Security notes

The session cookie is `HttpOnly`, `SameSite=Strict`, `Secure` in production, scoped to `/api/students`, signed with the server-only `SUPABASE_LRN_HMAC_SECRET`, and contains only a student UUID plus expiry and signature. It does not contain the student's name, LRN, PIN, or grades. Session responses set `Cache-Control: no-store, private` and are not indexed. Do not put student identifiers or PINs in paths or query strings.

The cookie can remain active for up to 30 days while used; logging out clears it from the current browser. If the school requires immediate server-side revocation of copied/stolen sessions across devices, add a server-side session registry and revoke records at logout.

## Files added or changed

- `lib/server/security.ts`: signed student session ticket helpers.
- `lib/server/student-grade-report.ts`: server-side report loader for a verified student ID.
- `app/api/students/session/route.ts`: authenticated session check and grade-report API.
- `app/api/students/logout/route.ts`: clears student session and feedback ticket cookies.
- `app/api/students/lookup/route.ts`: creates a session after successful PIN verification.
- `app/api/students/feedback/route.ts`: supports feedback submissions from the authenticated dashboard session.
- `app/student/dashboard/page.tsx`: private, noindex dashboard route.
- `components/student-grade-dashboard.tsx`: mobile-first dashboard with collapsible grade/assessment tables and feedback form.
- `components/student-portal.tsx`: redirects verified students to their dashboard and sends returning sessions there.
- `app/globals.css`: responsive dashboard styles.

## Deployment

No additional SQL migration is required for this update. Keep existing Supabase and security environment variables configured. Run `npm ci`, `npm run typecheck`, and `npm run build`, then deploy. After deployment, test login, refresh, sign out, expired session, mobile grade display, grade-report CSV download, and parent feedback.
