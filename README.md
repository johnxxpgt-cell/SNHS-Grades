# SNHS Gradebook

A responsive grade portal for Salvacion National High School. Students register into an open teacher section and look up their report with their full name, LRN, and 4-digit PIN. Teachers use Supabase Auth to manage their class roster, three-semester grades, assessment scores, and student comments.

## Stack

- Next.js App Router for the site and server endpoints; deploys to Vercel.
- Supabase Postgres for records, Supabase Auth for teacher accounts, and row-level security for teacher access.
- Teacher and student photos are resized in the browser, converted to WebP files, and stored in a private Supabase Storage bucket. The database stores the object path; the app issues short-lived signed links when an authorized viewer needs the photo.

## Local setup

Use Node.js 20.9 or later for Next.js 16.

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. For an existing installation, run [`supabase/migrations/20261012_student_pin_assessments_comments.sql`](supabase/migrations/20261012_student_pin_assessments_comments.sql) if the PIN, assessment, and comment changes are not installed, then run [`supabase/migrations/20261012_trisemester_storage_auth.sql`](supabase/migrations/20261012_trisemester_storage_auth.sql). Existing quarter grades are preserved and copied as follows: Q1 to Semester 1, Q2 to Semester 2, and the average of Q3/Q4 to Semester 3 (or the only available Q3/Q4 value).
3. Copy [`.env.example`](.env.example) to `.env.local`. `NEXT_PUBLIC_APP_URL` is set to the production app (`https://snhs-grades.vercel.app`) so confirmation links open the live site; change it to `http://localhost:3000` only when you want confirmation links to return to a running local server. Fill in the Supabase project URL, publishable key, server-only secret key, a random HMAC secret of at least 32 bytes, and a base64-encoded 32-byte AES key (for example, generate one with `openssl rand -base64 32`). For an existing installation, run `node --env-file=.env.local scripts/migrate-legacy-avatars.mjs` once to move existing WebP photos into the private bucket and clear their old database copies.
4. Install packages with `npm install`, then run `npm run dev`.
5. In Supabase Auth settings, enable email confirmation for teacher accounts. Under **URL Configuration**, set the production **Site URL** to `https://snhs-grades.vercel.app`, then add `http://localhost:3000/auth/callback` and `https://snhs-grades.vercel.app/auth/callback` to **Redirect URLs**. Add a matching callback URL for any preview domain you use. Set Vercel’s `NEXT_PUBLIC_APP_URL` environment variable to `https://snhs-grades.vercel.app` and redeploy. Supabase falls back to its Site URL if the callback is not allowlisted. A localhost confirmation link works only while the local app is running on that computer.

Never add the Supabase secret key, HMAC secret, or AES key to a `NEXT_PUBLIC_` variable. Keep all server secrets stable: changing the HMAC secret makes existing student LRNs and lookup proofs unmatchable; changing the AES key makes stored birthdays unreadable.

## Vercel deployment

Import this project into Vercel and add the six environment variables for the production environment, setting `NEXT_PUBLIC_APP_URL` to `https://snhs-grades.vercel.app`. Deploy after the SQL schema is installed and the Supabase Auth site/redirect URLs include the production domain. Preview deployments need their own allowed redirect URL if teacher email confirmation is tested there.

## Access and data protection

- Teacher passwords and sessions are managed by Supabase Auth.
- Teacher profiles, sections, student rosters, and subject grades use Postgres row-level security. Teachers can read and edit only their own sections; student rows have no public table policy. New teacher accounts start without a section, which they add after signing in.
- Student registration and grade lookup run through server-only endpoints using the Supabase secret key. The LRN and 4-digit PIN are not stored in plaintext: the server stores keyed HMAC-SHA-256 digests, and checks happen server-side. PIN lookups are rate-limited by network address and student record. Birthdays are encrypted with AES-256-GCM before they reach Postgres. Registration requests are rate-limited in Postgres.
- Supabase provides database transport and storage encryption. Profile photos use a private bucket with teacher ownership policies; student lookup links are created only after a successful PIN check, and teacher links are limited to their roster.
- Students use their full name, LRN, and PIN to look up grades, assessment scores, and the latest teacher comment. The downloadable PNG report includes the school logo and semester/final grades, without assessment scores. Existing records from before the PIN upgrade set their PIN on their first successful lookup. Do not share LRNs or PINs publicly.

## Routes

- `/` — school landing page and role selection.
- `/student` — student grade lookup and class registration.
- `/teacher` — teacher sign-in/registration and classroom workspace.
- `/api/sections` — public list of active class sections only.
- `/api/students/register` — server-side student registration.
- `/api/students/lookup` — server-side grade lookup.
