# SNHS Gradebook

A responsive grade portal for Salvacion National High School. Students register into an open teacher section and look up their report with their full name, LRN, and 4-digit PIN. Teachers use Supabase Auth to manage their class roster, three-semester marks, assessment scores, student comments, and a class-wide E-Class-Record-style scorebook.

## Stack

- Next.js App Router 16 and React 19 for server-rendered pages, metadata, and server endpoints.
- Supabase Postgres for records, Supabase Auth for teacher accounts, row-level security for teacher access, and private Storage for profile photos.
- Vercel deployment.
- WebP profile photos. LRNs/access proofs and PINs use keyed HMAC digests; birthdays and contact-form fields are encrypted using separate AES-256-GCM keys before storage.

## Local setup

1. Create a Supabase project.
2. For a fresh project, run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. For an existing installation, apply the project's original migrations as described in your installed schema state and also run [`supabase/migrations/20261015_privacy_contact.sql`](supabase/migrations/20261015_privacy_contact.sql) and [`supabase/migrations/20261015_class_scorebook.sql`](supabase/migrations/20261015_class_scorebook.sql).
3. Copy [`.env.example`](.env.example) to `.env.local` and configure Supabase URL, browser publishable key, server secret key, stable HMAC, birthday-encryption and contact-encryption keys, canonical URL and the official school privacy contact. Optional Google integrations stay disabled until their values are set.
4. Install and start the app with `npm ci` and `npm run dev`.
5. In Supabase Auth, enable email confirmation for teacher accounts and allow the deployed `/auth/callback` URL. In Vercel, explicitly set `NEXT_PUBLIC_APP_URL` to the real canonical production origin and redeploy.

Never put the Supabase server secret, HMAC secret, or AES key in a `NEXT_PUBLIC_` variable. Keep existing HMAC/AES keys stable; rotation requires a migration plan. Do not commit `.env.local`.

## Routes

- `/` — public school portal landing page.
- `/student` — student grade lookup and class registration (noindex).
- `/teacher` — teacher sign-in and classroom workspace, including the class-wide scorebook under **Open class scorebook** (noindex).
- `/teacher/messages` — encrypted contact inbox for explicitly allowlisted, authenticated school accounts (noindex).
- `/contact` — public contact form.
- `/privacy` — Privacy Policy draft for school review.
- `/terms` — Terms of Service draft for school review.
- `/auth/callback` — teacher email confirmation callback (noindex).
- `/api/sections` — active class sections only.
- `/api/students/register` — server-side student registration.
- `/api/students/lookup` — server-side grade lookup.
- `/api/contact` — contact submit API and protected inbox GET/PATCH API.

## SEO and privacy

The project includes canonical and Open Graph metadata, a generated social-share image, Organization JSON-LD, Search Console verification support, consent-gated GA4 on public pages, `robots.txt`, a public-only sitemap, breadcrumbs, and a custom 404 page. Student and teacher routes are marked noindex and disallowed in robots.txt; this is SEO behavior, not an access control boundary.

The contact form encrypts personal fields before database storage, enforces consent and request limits, and supports an allowlisted contact inbox. Contact retention is not automated; authorized inbox administrators can delete messages, but the school must approve a recurring deletion review or scheduled cleanup before launch. The existing direct Supabase teacher portal still uses database row-level security for names and academic records; those fields are not application-field encrypted. Review [`AUDIT_REPORT.md`](AUDIT_REPORT.md) and [`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md) for exact configuration steps, residual risks, and production verification requirements.

## Production compliance reminder

The Privacy Policy and Terms are drafts that need approval from the responsible school/DepEd privacy officer. Before launch, confirm the Personal Information Controller identity, monitored privacy contact, lawful bases, retention schedule for official school records, minor/guardian authorization process, processor agreements and incident-response obligations. Adding web pages and checkboxes alone does not establish legal compliance.

## Class scorebook

The teacher dashboard now includes an Excel-style whole-class assessment table. Teachers select a section, subject, and quarter; add Written Works, Performance Tasks, and Summative Test/Exam columns; enter scores for each student; and save changed cells. Empty cells are missing scores, while `0` is a real score. Row-level security restricts records by teacher-owned class section, and a database trigger enforces student/section matching and score maximums.

Before use, existing Supabase installations must apply `supabase/migrations/20261015_class_scorebook.sql`. The page can calculate a weighted initial score from one of the suggested weight profiles, but the school must confirm the exact subject weights and add/validate its official transmutation table before treating that value as the final quarterly grade. This feature does not yet publish these new scorebook scores to the existing student-facing grade report. See [`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md).
