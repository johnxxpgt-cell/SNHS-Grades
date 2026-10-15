# Request ID / UUID Query Parameters

## What is added

- Student and teacher entry links add a fresh `request_id=<UUID>` query parameter when clicked.
- Direct visits to `/student` and `/teacher` create a UUID if one is missing.
- Each first-party browser request to an `/api/*` endpoint gets its own UUID in `request_id` and an `X-Request-ID` request header.
- `proxy.ts` validates/preserves UUIDs, forwards the correlation ID as `x-request-id`, and echoes it in the response `X-Request-ID` header.
- Student login/registration server failures display the response reference ID. Teacher auth failures rotate the URL ID and display it as a reference; the client logs only the reference ID, flow stage, and error class (never credentials or form fields).
- The private student dashboard remains `/student/dashboard` without an identifier in its URL after successful student lookup. Sensitive values (PIN, LRN, student ID, access tokens) are never placed in query parameters.

## Security notes

`request_id` is a **correlation identifier only**, not a login token or access-control mechanism. It is safe to appear in URLs and logs because it grants no access to student records. The application still authenticates students using the existing PIN-protected flow and an HTTP-only signed session cookie.

The teacher login itself is performed by Supabase Auth from the browser. This change tags the app's teacher-login page/action for troubleshooting, but does not alter Supabase's authentication endpoint query string. Adding arbitrary query parameters to Supabase Auth or PostgREST URLs could be incompatible with provider request parsing; the app therefore keeps that external API contract unchanged.

## How to use a reference ID

1. Open browser DevTools → Network.
2. Select the first-party `/api/...` request that failed.
3. Read `request_id` in the Request URL or `X-Request-ID` in the response headers.
4. Search Vercel Runtime Logs for the same ID when the route logs the failure.

Do not use request IDs as database primary keys, student identifiers, teacher identifiers, or authorization credentials.
