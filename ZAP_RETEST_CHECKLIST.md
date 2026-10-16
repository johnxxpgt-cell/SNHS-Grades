# SNHS Gradebook — ZAP Retest Checklist

Run this after deploying to the same HTTPS host targeted by ZAP.

## 1. Header baseline

```bash
curl -sSI https://snhs.darrenbardelas.xyz/ 
```

Verify response has `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, and production `Strict-Transport-Security`. Because the app uses request nonces, CSP can differ between requests; do not expect a static header value.

For private routes (unauthenticated requests may be redirected or return an auth error):

```bash
curl -sSI https://snhs.darrenbardelas.xyz/student/dashboard
curl -sSI https://snhs.darrenbardelas.xyz/api/students/session
curl -sSI https://snhs.darrenbardelas.xyz/api/students/photo
```

Check that private responses use `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, and `Expires: 0`.

## 2. Cross-origin behavior

```bash
curl -si -X OPTIONS \
  -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  https://snhs.darrenbardelas.xyz/api/contact

curl -si -X POST \
  -H 'Origin: https://evil.example' \
  -H 'Sec-Fetch-Site: cross-site' \
  -H 'Content-Type: application/json' \
  --data '{}' \
  https://snhs.darrenbardelas.xyz/api/contact
```

The mutating request should be rejected and the app should not emit `Access-Control-Allow-Origin: *` or reflect `https://evil.example`. Interpret the `OPTIONS` result based on the actual framework response; a successful preflight must not grant cross-origin read access.

## 3. Sensitive data in URLs

- Submit the contact form through ZAP's form scanner.
- Ensure the generated URI remains `/contact` and form values appear only in the POST body.
- Confirm no LRN, PIN, email, message, name, or grade field appears in URLs or Referer headers.
- `request_id=<UUID>` is accepted as a non-secret correlation ID; it must never contain identity/authentication data.

## 4. Caching and account switching

1. Sign in as student A and view a grade and profile photo.
2. Log out, then sign in as student B in the same browser profile.
3. Confirm B never sees A's grade/photo from browser or intermediary cache.
4. Check student API, feedback API, contact inbox, and teacher routes for `no-store`.
5. Confirm only public, non-personalized static assets remain cacheable.

## 5. CSP feature regression

With analytics rejected and then accepted, test public page navigation. Test teacher sign-in, class/grade updates, student registration, profile upload, and feedback. Check browser console for CSP violations. Only expand CSP sources for a required, trusted origin; do not add `*` or `'unsafe-eval'` to silence reports.

## 6. Suspicious comments and User-Agent Fuzzer

For every alert, retain the exact ZAP URI, evidence, Risk, and Confidence.
- If a comment is in an emitted response, decide whether it exposes internal data. Keep license notices required by dependencies.
- Run the same public request with a standard browser User-Agent and ZAP's fuzzer values. Compare response status/body/headers. A changed User-Agent alone is not a vulnerability unless it changes access control or exposes sensitive data.

## Scope note

`Scan.csv` currently available with this release is a site-tree/crawl export (URLs/Methods/Flags), not the ZAP Alerts report. Import/export the ZAP **Alerts** table for a finding-by-finding closure decision.
