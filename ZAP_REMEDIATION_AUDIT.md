# SNHS Gradebook — ZAP Remediation Audit

**Audit date:** 16 October 2026  
**Baseline:** `SNHS-Gradebook-Photo-Upload-Required-Collapsible-Grades.zip`  
**Target domain in supplied crawl:** `https://snhs.darrenbardelas.xyz`

## Important limitation in the supplied scan file

`Scan.csv` is a **ZAP crawl/site-tree export**, not a ZAP alerts export. It contains 75 rows and only four columns (`Processed`, `Method`, `URI`, `Flags`); every recorded request is `GET`. It has no alert name, risk rating, confidence, evidence, response header, or solution columns. The crawl file alone therefore cannot prove each alert was found or cleared.

It does provide actionable corroborating evidence. The crawler recorded this synthetic contact-form URL:

`https://snhs.darrenbardelas.xyz/contact?email=zaproxy%40example.com&message=...&name=ZAP&subject=...&website=ZAP`

This is consistent with the HTML form's default GET behavior when the crawler submits it without the client-side JavaScript handler. All JSX forms have now been explicitly changed to `method="post"` to prevent form fields being appended to URLs if the handler is bypassed. The file records three `Seed` entries, 41 entries with an empty `Flags` value, and 31 `Out of Scope` entries. It includes URLs to the app, static Next.js assets, Google Tag Manager, Next.js documentation, and the Supabase project. The Supabase URL is marked Out of Scope in this crawl.

## Implemented source changes

### 1. Content Security Policy (CSP) Header Not Set

- Added an enforced production CSP in root `proxy.ts` using a fresh per-request nonce.
- Passes that CSP/nonce to Next.js on the request so framework-rendered scripts can receive the nonce.
- Adds the nonce to the JSON-LD script in `app/layout.tsx`.
- Includes `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `frame-src 'none'`, `form-action 'self'`, `script-src-attr 'none'`, and explicit script/style/image/font/connect/worker/manifest sources.
- CSP is deliberately production-only (`NODE_ENV=production`). Confirm it on the deployed production/preview build, not `next dev`.

### 2. Cross-Domain Misconfiguration

- The application does not emit `Access-Control-Allow-Origin`.
- The proxy rejects cross-origin or missing-Origin browser mutations, and rejects cross-site API fetches when `Sec-Fetch-Site: cross-site` is present.
- Responses include same-origin CORP and COOP headers.
- The app's direct browser Supabase Auth/API usage must continue to work under Supabase's own CORS/RLS model. Do not blindly disable CORS on the Supabase host. If ZAP's actual alert target is `*.supabase.co`, it is a separate resource and must be assessed against Supabase RLS/data exposure and the configured allowed origins; the supplied crawl marks the Supabase URL Out of Scope.

### 3. Information Disclosure — Sensitive Information in URL

- All 12 JSX `<form>` tags now explicitly specify `method="post"`, including contact, student lookup/registration, student/parent feedback, scorebook, and teacher forms. The interactive handlers still use `preventDefault` and same-origin API requests.
- Runtime application paths no longer call Supabase `createSignedUrl`/`createSignedUrls` for student/teacher photos. Student photos are served through `/api/students/photo` after verifying the student's HTTP-only session. Teacher photo blobs are downloaded through authenticated Supabase client calls and used as local Blob URLs.
- `/auth/callback` receives `Referrer-Policy: no-referrer`.
- Private pages and APIs use no-store cache headers.
- `request_id` remains a URL query parameter by prior design, but is a random correlation ID only; it is not an authentication token, LRN, PIN, user name, grade, or other student data. The server always generates its authoritative `X-Request-ID`.

### 4. Information Disclosure — Suspicious Comments

- Production browser source maps are disabled via `productionBrowserSourceMaps: false`.
- A source scan found no `TODO`, `FIXME`, `XXX`, `HACK`, or `DEBUG` markers in runtime application source.
- The crawl contains links to framework documentation and a dependency license page in JS bundle discovery. These URLs alone do not establish that a suspicious comment is present. Do not delete legally required dependency license notices. Review the exact URL and response evidence in the ZAP Alerts export before deleting a comment.

### 5. Re-examine Cache-Control Directives / Retrieved from Cache

- Private paths (`/student`, `/teacher`, `/auth`, and `/api/*`) receive `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, and `Expires: 0` from the proxy.
- JSON error/private responses include equivalent no-store directives.
- The private student photo endpoint returns only the active student's image after session verification and sets no-store plus `Vary: Cookie`.
- Public versioned static assets remain eligible for framework/CDN caching; they must not carry personalized grade data. This is intentional.
- A browser/cache isolation test is still required on the deployed host to demonstrate that logging out and signing into a different account never reveals cached grades/photos from a previous user.

### 6. User Agent Fuzzer

- No authorization/security decision in the reviewed runtime source relies on the `User-Agent` value.
- There is no single safe code change justified without the actual ZAP evidence. Repeat the fuzzer test and compare status, body, and headers for normal and unusual User-Agent values. Do not deny legitimate users based only on the User-Agent header.

## Automated source checks performed

`npm run security:check` runs `scripts/check-security-remediation.mjs`. It statically checks for the production CSP, layout nonce, absence of application CORS allow-origin headers, same-origin API protections, POST form methods, absence of signed photo URL helpers in runtime source, private cache headers, disabled browser source maps, streaming body limits, and common suspicious developer markers.

Local static check result at packaging time: **10 checks passed, 0 failed**. A TypeScript transpilation pass completed across **50 `.ts`/`.tsx` files with 0 syntax errors**.

These are static source checks, not proof of runtime security. The registry was unreachable during this session, so a fresh dependency install, `npm run typecheck`, and `npm run build` could not be completed. The recent dependency patch versions are pinned in `package.json`, but updated lockfile entries could not be rehydrated with registry-provided integrity metadata while offline. Before production, use a network-enabled environment to regenerate/verify the lockfile:

```bash
npm install next@16.4.1 react@19.3.1 react-dom@19.3.1 --save-exact
npm ci
npm run security:check
npm run typecheck
npm run build
```

Next.js 16.4.1 is listed as patched in the official October 14, 2026 Next.js security advisory. React 19.3.1 is the corresponding October 14, 2026 React patch release. See links below.

## Manual checks required before closure

1. Deploy to a Vercel preview/production target and confirm `Content-Security-Policy` appears on HTML document responses and no feature is blocked by CSP (teacher login, Supabase, photo upload, consented Google Analytics, feedback).
2. In ZAP, verify the scan target is the HTTPS app domain. Export **Alerts** as CSV or HTML with the full URI, Risk, Confidence, Evidence, and Parameter fields.
3. Verify no `Access-Control-Allow-Origin: *` or reflected arbitrary Origin appears on app API responses. Test cross-origin preflight and mutation attempts; ensure they cannot read or change data.
4. Submit the contact form with ZAP again. Confirm fields are in a POST body and the URL contains no email, name, message, LRN, PIN, or grade input.
5. Inspect the exact Suspicious Comments response. Keep third-party license notices; remove only comments exposing internal information or credentials.
6. Verify student/teacher/API responses have all no-store headers, and test user switching in one browser profile for cached-data leakage.
7. Compare normal and fuzzed User-Agent responses. Confirm no authentication/authorization differs based on User-Agent.
8. Re-scan both the app origin and any other origin reported in alerts. Findings on `*.supabase.co` or third-party hosts require separate scope/ownership and configuration checks.

## References

- Next.js official security advisory: https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- Next.js security update: https://nextjs.org/blog/nextjs-security-update-october-14-2026
- React releases: https://github.com/facebook/react/releases
- Vercel request headers (trusted proxy/IP behavior): https://vercel.com/docs/headers/request-headers
