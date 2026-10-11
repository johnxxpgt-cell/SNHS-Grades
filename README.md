# SNHS Gradebook

A responsive grade portal for Salvacion National High School. Students register into an open teacher section and look up their report with their full name, LRN, and 4-digit PIN. Teachers use Supabase Auth to manage their class roster, quarterly grades, assessment scores, and student comments.

## Stack

- Next.js App Router for the site and server endpoints; deploys to Vercel.
- Supabase Postgres for records, Supabase Auth for teacher accounts, and row-level security for teacher access.
- Student photos are resized in the browser, converted to WebP, and stored as base64 data URLs.

## Local setup

Use Node.js 20.9 or later for Next.js 16.

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. For an existing installation, run [`supabase/migrations/20261012_student_pin_assessments_comments.sql`](supabase/migrations/20261012_student_pin_assessments_comments.sql) to add the PIN, assessment, and comment tables without removing existing records.
3. Copy [`.env.example`](.env.example) to `.env.local` and fill in the Supabase project URL, publishable key, server-only secret key, a random HMAC secret of at least 32 bytes, and a base64-encoded 32-byte AES key (for example, generate one with `openssl rand -base64 32`).
4. Install packages with `npm install`, then run `npm run dev`.
5. In Supabase Auth settings, enable email confirmation for teacher accounts and set the site URL plus redirect URLs for local development and the Vercel domain.

Never add the Supabase secret key, HMAC secret, or AES key to a `NEXT_PUBLIC_` variable. Keep all server secrets stable: changing the HMAC secret makes existing student LRNs and lookup proofs unmatchable; changing the AES key makes stored birthdays unreadable.

## Vercel deployment

Import this project into Vercel and add the same five environment variables for the production environment. Deploy after the SQL schema is installed and the Supabase Auth site/redirect URLs include the production domain. Preview deployments need their own allowed redirect URL if teacher email confirmation is tested there.

## Access and data protection

- Teacher passwords and sessions are managed by Supabase Auth.
- Teacher profiles, sections, student rosters, and subject grades use Postgres row-level security. Teachers can read their own class records; student rows have no public table policy.
- Student registration and grade lookup run through server-only endpoints using the Supabase secret key. The LRN and 4-digit PIN are not stored in plaintext: the server stores keyed HMAC-SHA-256 digests, and checks happen server-side. PIN lookups are rate-limited by network address and student record. Birthdays are encrypted with AES-256-GCM before they reach Postgres. Registration requests are rate-limited in Postgres.
- Supabase provides database transport and storage encryption. Full names, gender, and profile image data remain personal information and are available only through the policies and endpoints described above. Base64 is an image encoding, not encryption.
- Students use their full name, LRN, and PIN to look up grades, assessment scores, and the latest teacher comment. Existing records from before the PIN upgrade set their PIN on their first successful lookup. Do not share LRNs or PINs publicly.

## Routes

- `/` — school landing page and role selection.
- `/student` — student grade lookup and class registration.
- `/teacher` — teacher sign-in/registration and classroom workspace.
- `/api/sections` — public list of active class sections only.
- `/api/students/register` — server-side student registration.
- `/api/students/lookup` — server-side grade lookup.
