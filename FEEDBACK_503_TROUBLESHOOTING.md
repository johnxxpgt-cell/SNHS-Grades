# Student/Parent Feedback API — 503 Troubleshooting

## What the browser message means

`POST /api/students/feedback` returning HTTP 503 means the server-side handler hit an unexpected dependency/configuration error. The Grammarly extension warnings are browser-extension telemetry and are not the cause of this request failure.

This update logs a random request ID, the processing stage, an error name/code, and a technical error detail to the Vercel Function Logs. It does **not** return SQL errors or secret values to the browser. When the API fails, the form shows a reference ID to help locate the matching server log.

## Fix checklist

1. **Confirm the environment variables in Vercel → Project → Settings → Environment Variables.**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_ROLE_KEY` (legacy Supabase projects)
   - `SUPABASE_LRN_HMAC_SECRET` (at least 32 UTF-8 bytes; keep it stable because student access digests and signed feedback tickets depend on it)
   - `SUPABASE_CONTACT_ENCRYPTION_KEY` (Base64 encoding of exactly 32 random bytes; independent of the birthday/data encryption key)

   Ensure these are configured for the deployment environment being tested (Production, Preview, or Development). Do not paste their values into an issue, chat, or browser console. After editing Vercel environment variables, redeploy.

   Generate a new independent contact key only when initializing the feature for the first time, using:
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```
   Keep that key stable after messages have been encrypted; changing it makes existing parent feedback unreadable.

2. **Apply the Supabase migrations.** The table `public.student_parent_feedback` and subject catalog `public.gradebook_subjects` are created by `supabase/migrations/20261015_subject_roster_parent_feedback.sql`. Apply migrations in the order documented by `IMPLEMENTATION_GUIDE.md`; do not blindly rerun only the final migration if required earlier tables/functions do not exist.

3. **Check rate-limit migration/function.** Submission calls `public.consume_request_limit` for abuse prevention. If the first failure log stage is `global_rate_limit` or `student_rate_limit`, confirm the existing rate-limit migration has been applied and the function is available to the server's Supabase key.

4. **Use the server log to pinpoint the failing dependency.** In Vercel, open Deployments → the active deployment → Functions/Runtime Logs. Filter for:
   ```text
   [api/students/feedback] submission failed
   ```
   Match the log's `requestId` with the reference ID displayed in the form. The `stage` value narrows the cause:
   - `global_rate_limit` / `student_rate_limit`: request-limit RPC or Supabase configuration.
   - `supabase_admin_client` / `load_student_and_section`: server key, student query, or section relation.
   - `verify_subject`: subject catalog migration/query, if a subject was selected.
   - `encrypt_feedback`: missing/invalid `SUPABASE_CONTACT_ENCRYPTION_KEY`.
   - `insert_feedback`: feedback table missing, migration not applied, database constraint/schema mismatch, or service key permissions.

5. After correcting configuration/schema, redeploy and test from a newly verified student grade lookup. The signed ticket expires after 15 minutes; do not reuse an old tab/ticket for the retest.

## Privacy

The API logs technical error context only and does not log the submitted guardian name or message. Never expose stack traces, raw Supabase errors, encryption keys, service keys, LRNs, or PINs to the browser/client logs.
