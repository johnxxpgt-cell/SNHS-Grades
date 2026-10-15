# SNHS Gradebook

A responsive grade portal for Salvacion National High School. Students register into an open teacher section and look up their report with their full name, LRN, and 4-digit PIN. Teachers use Supabase Auth to manage their class roster, three-term marks, assessment scores, student comments, and a class-wide E-Class-Record-style scorebook.

## Stack

- Next.js App Router 16 and React 19 for server-rendered pages, metadata, and server endpoints.
- Supabase Postgres for records, Supabase Auth for teacher accounts, row-level security for teacher access, and private Storage for profile photos.
- Vercel deployment.
- WebP profile photos. LRNs/access proofs and PINs use keyed HMAC digests; birthdays and contact-form fields are encrypted using separate AES-256-GCM keys before storage.

## Local setup

1. Create a Supabase project.
2. For a fresh project, run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. For an existing installation, apply pending original migrations first, then [`supabase/migrations/20261015_privacy_contact.sql`](supabase/migrations/20261015_privacy_contact.sql), [`supabase/migrations/20261015_class_scorebook.sql`](supabase/migrations/20261015_class_scorebook.sql), then [`supabase/migrations/20261015_subject_roster_parent_feedback.sql`](supabase/migrations/20261015_subject_roster_parent_feedback.sql), and lastly [`supabase/migrations/20261015_terms_mobile_ux.sql`](supabase/migrations/20261015_terms_mobile_ux.sql). Check which migrations have already been run before applying them.
3. Copy [`.env.example`](.env.example) to `.env.local` and configure Supabase URL, browser publishable key, server secret key, stable HMAC, birthday-encryption and contact-encryption keys, canonical URL and the official school privacy contact. Optional Google integrations stay disabled until their values are set.
4. Install and start the app with `npm ci` and `npm run dev`.
5. In Supabase Auth, enable email confirmation for teacher accounts and allow the deployed `/auth/callback` URL. In Vercel, explicitly set `NEXT_PUBLIC_APP_URL` to the real canonical production origin and redeploy.

Never put the Supabase server secret, HMAC secret, or AES key in a `NEXT_PUBLIC_` variable. Keep existing HMAC/AES keys stable; rotation requires a migration plan. Do not commit `.env.local`.

## Routes

- `/` — public school portal landing page.
- `/student` — student grade lookup and class registration (noindex).
- `/teacher` — teacher sign-in and classroom workspace, including the class-wide scorebook under **Open class scorebook** (noindex).
- `/teacher/messages` — encrypted contact inbox for explicitly allowlisted, authenticated school accounts (noindex).
- `/teacher/feedback` — encrypted parent/guardian feedback assigned to the registered class adviser (noindex).
- `/contact` — public contact form.
- `/privacy` — Privacy Policy draft for school review.
- `/terms` — Terms of Service draft for school review.
- `/auth/callback` — teacher email confirmation callback (noindex).
- `/api/sections` — active class sections only.
- `/api/students/register` — server-side student registration.
- `/api/students/lookup` — server-side grade lookup, class-adviser attribution, and a short-lived feedback ticket.
- `/api/students/feedback` — privacy-consented parent/guardian feedback routed to the section owner.
- `/api/parent-feedback` — authenticated teacher inbox API, including new-message count and status workflow.
- `/api/contact` — contact submit API and protected inbox GET/PATCH API.

## SEO and privacy

The project includes canonical and Open Graph metadata, a generated social-share image, Organization JSON-LD, Search Console verification support, consent-gated GA4 on public pages, `robots.txt`, a public-only sitemap, breadcrumbs, and a custom 404 page. Student and teacher routes are marked noindex and disallowed in robots.txt; this is SEO behavior, not an access control boundary.

The contact form encrypts personal fields before database storage, enforces consent and request limits, and supports an allowlisted contact inbox. Contact retention is not automated; authorized inbox administrators can delete messages, but the school must approve a recurring deletion review or scheduled cleanup before launch. The existing direct Supabase teacher portal still uses database row-level security for names and academic records; those fields are not application-field encrypted. Review [`AUDIT_REPORT.md`](AUDIT_REPORT.md) and [`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md) for exact configuration steps, residual risks, and production verification requirements.

## Production compliance reminder

The Privacy Policy and Terms are drafts that need approval from the responsible school/DepEd privacy officer. Before launch, confirm the Personal Information Controller identity, monitored privacy contact, lawful bases, retention schedule for official school records, minor/guardian authorization process, processor agreements and incident-response obligations. Adding web pages and checkboxes alone does not establish legal compliance.

## Class scorebook

The teacher dashboard now includes an Excel-style whole-class assessment table. Teachers select a section, subject, and term; add Written Works, Performance Tasks, and Summative Test/Exam columns; enter scores for each student; and save changed cells. Empty cells are missing scores, while `0` is a real score. Row-level security restricts records by teacher-owned class section, and a database trigger enforces student/section matching and score maximums.

Before use, existing Supabase installations must apply `supabase/migrations/20261015_class_scorebook.sql` and then `supabase/migrations/20261015_subject_roster_parent_feedback.sql`. Teachers can save subjects to a section-specific catalog and choose them from a dropdown on later visits. The **Add subject to grade roster** action adds blank three-term rows for existing students without overwriting existing marks; an insert trigger seeds already-saved subjects for students registered later. Entered scorebook assessment scores are also included in the private student/parent report. The page can calculate a weighted initial score from one of the suggested weight profiles, but the school must confirm the exact subject weights and official transmutation table before treating that value as the final term grade. See [`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md).

## Parent/guardian feedback and class adviser

A verified private grade lookup enables a privacy-consented feedback form. Feedback message content and guardian name are encrypted before storage in `student_parent_feedback`, and the responsible teacher is taken from the student's registered `teacher_sections.teacher_id` rather than supplied by the sender. That teacher can review and update messages at `/teacher/feedback`; the dashboard shows the count of new messages and refreshes it every minute while open. Student registration and grade lookup display the assigned adviser name from the same section owner. This release routes feedback into the dashboard inbox; it does not send email notifications.
## Latest build fix

The Open Graph image prerender error caused by a headline `div` containing `<br />` without an explicit display layout has been corrected in `app/opengraph-image.tsx`. See `BUILD_FIX_NOTES.md` for the cause and verification status.


## Three-term grading and mobile improvements

The current UI and active API/database keys use **Term 1**, **Term 2**, and **Term 3** only (`term_1`, `term_2`, `term_3`, and `term_number`). The historical migration files still mention old semester/quarter names only so the upgrade can safely recognize and migrate existing database columns; these are not labels exposed by the current interface.

For an existing installation, first back up the database and apply any pending original scorebook and subject/feedback migrations in dependency order. Then apply `supabase/migrations/20261015_terms_mobile_ux.sql` exactly once. It renames old grade columns to term keys, converts scorebook period 4 into Term 3 without deleting assessment scores, and safely renames colliding assessment labels before adding the three-term constraint. Because former periods 3 and 4 are consolidated into Term 3, review the Term 3 assessment list after migration. For a fresh installation, use the current `supabase/schema.sql` instead of replaying upgrade migrations on top of it.

The public homepage has clear **Register as a student** and **Teacher sign in** entry points. On a phone, student registration/grade lookup appears as two stacked choices, the class scorebook switches to touch-friendly student cards, and grade reports show one subject/assessment card at a time rather than forcing wide horizontal scrolling.

## Private student dashboard update

After a successful student grade lookup with name, LRN, and PIN, the app redirects to `/student/dashboard`. The dashboard uses an HttpOnly signed session cookie so the student can refresh or reopen their report without putting their LRN, PIN, or student ID into a URL. Use **Log out** to clear the session. Grade tables use expandable sections and switch to labeled cards on mobile.

See `STUDENT_DASHBOARD_SESSION_UPDATE.md` for route behavior, security notes, and deployment checks.
