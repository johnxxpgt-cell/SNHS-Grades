# SNHS Gradebook — SEO, Performance, Routing and Security Audit

**Reviewed:** 15 October 2026  
**Stack found:** Next.js App Router 16, React 19, TypeScript, Supabase Auth/Postgres/Storage, Vercel deployment.

## Added

- Canonical URL, per-page title/description and Open Graph metadata for public pages.
- A generated 1200×630 Open Graph image and `EducationalOrganization` JSON-LD.
- Google Search Console verification support through `GOOGLE_SITE_VERIFICATION`.
- GA4 support behind an explicit analytics opt-in; page views are manually limited to public routes.
- `app/robots.ts` and `app/sitemap.ts`; only public informational pages are included in the sitemap.
- `noindex` metadata for the student, teacher, confirmation and contact-inbox routes.
- Custom `app/not-found.tsx` and shared breadcrumb navigation.
- Public contact, privacy and terms pages, plus internal links to them.
- A contact API with input validation, payload limits, honeypot handling, database rate limiting, consent-version checks, restricted message deletion and no sensitive payload logging.
- Application-level AES-256-GCM encryption of contact name, email, subject and message fields before storage, using a dedicated contact-encryption key separate from the student birthday key. Decryption is restricted to an authenticated API and an explicit server-side email allowlist.
- Versioned privacy acknowledgement on student lookup, student registration and teacher registration. Student registration consent timestamp/version are stored in the student record; teacher signup stores its notice version/time in Supabase Auth user metadata; contact consent version/time is stored with the inquiry.
- Additional security headers, lazy loading/async decoding for non-critical profile images, and a documented deployment checklist.

## Skipped (Exists)

- SSR: already supplied by the Next.js App Router; existing pages and API routes remain in that framework.
- Basic title metadata, a favicon, core navigation, a WebP school logo, client-side WebP conversion for uploaded photos, Supabase row-level security, server-only Supabase credentials, LRN/access/PIN HMAC digests, birthday encryption, private profile-photo storage, basic security headers and database-backed rate limiting already existed.
- The existing routing library was not replaced, and the existing student/teacher business logic was kept in place.

## Skipped (Not Needed)

- A second routing framework or SSR migration is unnecessary for this Next.js project.
- Re-converting the existing WebP logo is unnecessary.
- API routes are intentionally excluded from the sitemap.
- No 301 redirects were added: the source contains no verified obsolete public paths and inventing redirect destinations could break valid navigation. If an actual legacy URL is identified, add only that exact mapping to `next.config.ts` using `permanent: true`.
- No extra lazy-loading wrapper was added around each route's main interactive portal: those are the primary feature screens and Next.js already code-splits route bundles. Deferring them would risk delaying core form content.
- A strict Content Security Policy was not added blindly; Next.js rendering, Supabase and opt-in Google tag scripts need a policy designed and tested with the deployment's nonce/script configuration. Do not copy a generic CSP that may disable the application.

## Important residual risks / production blockers

1. **Legal sign-off is required.** The Privacy Policy and Terms of Service are project-specific drafts, not a legal opinion or certification of compliance with Republic Act No. 10173. The school must verify the responsible Personal Information Controller, official privacy/DPO contact, applicable lawful bases, exact education-record retention schedule, data-sharing/processor arrangements, minor/guardian process, incident procedures and any National Privacy Commission obligations before production use.
2. **Not all existing academic PII is application-field encrypted.** Existing LRNs/access proofs and PINs are HMAC digests, birthdays are AES-GCM encrypted, and new contact fields are AES-GCM encrypted. However, student/teacher names, gender, and academic records remain readable to authorized database operations. The teacher UI currently reads these values directly through Supabase with RLS. Field-level encryption of those records requires a designed migration and server-side data-access refactor; it was not attempted here because a rushed change could break grade entry and existing records. Database/storage encryption-at-rest and RLS are important safeguards, but are not equivalent to application-level field encryption.
3. **Production values must be configured.** `NEXT_PUBLIC_APP_URL`, all Supabase values, stable HMAC/encryption keys, `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`, and `SUPABASE_CONTACT_ADMIN_EMAILS` must be configured correctly. Empty optional Google values deliberately disable those integrations.
4. **Google Analytics settings matter.** In the GA4 web-stream settings, disable automatic enhanced-measurement pageview/history tracking if it is enabled. The app sends manual pageviews only on public routes; private student/teacher route paths should not be collected.
5. **Live verification is still necessary.** The current updated source passed a syntax-transpilation pass for all 38 TypeScript/TSX files. A full TypeScript check and production Next.js build remain unverified because dependency installation failed with npm registry DNS errors (`EAI_AGAIN`) and an npm exit-handler error. Run `npm ci`, `npm run typecheck`, and `npm run build` in a normal network-enabled environment before release.

## Official legal reference

- National Privacy Commission, Data Privacy Act of 2012: https://privacy.gov.ph/data-privacy-act-/
- National Privacy Commission, Rights of Data Subjects: https://privacy.gov.ph/data-subject-rights/


## Follow-up implementation: class scorebook

A separate teacher-facing class scorebook has been added in `components/class-scorebook.tsx`. It is reached from the existing `/teacher` workspace and supports subject/term filtering, assessment columns for Written Works, Performance Tasks, and Summative Test/Exam, highest-possible-score validation, blank-vs-zero semantics, a bulk score grid, missing-cell counts, and weighted initial-score calculations.

The new storage is `gradebook_assessments` + `gradebook_scores`. The additive migration `supabase/migrations/20261015_class_scorebook.sql` enables RLS, restricts access to the teacher who owns the section, and installs a trigger to reject over-maximum scores or student/section mismatches. Existing term grades and individual Quiz/Activity/Exam functionality are preserved.

The displayed number is intentionally labelled an initial weighted score, not an official transmuted term grade. The current subject-weight profiles are suggested defaults; school policy and the official transmutation table must be verified before the result is used for report-card finalization. The scorebook does not write its weighted initial score into the existing subject-grade fields or apply the school's final transmutation table. Separately entered scorebook assessment scores are displayed on the verified student/parent report with subject and term context.


## Follow-up implementation: saved subjects, roster seeding and parent feedback

- Added a section-scoped, case-insensitive subject catalog (`gradebook_subjects`) and dropdown. Subject creation is owner-checked by a `SECURITY DEFINER` RPC; direct writes are not granted to authenticated clients.
- Added one-click subject seeding into traditional `subject_grades` rows. It inserts blank grades only where no row exists, never updates existing marks, and uses the class teacher as `updated_by`. A trigger applies catalog subjects to newly registered students too.
- Parent/guardian grade feedback is accepted only after a valid name/LRN/PIN grade lookup issues a short-lived signed, HTTP-only cookie. The target teacher comes from the student's section owner in the database; the sender cannot select another recipient.
- Guardian names and feedback messages use AES-256-GCM before storage. The feedback table has RLS enabled but no direct anon/authenticated grants; server endpoints authenticate teachers and filter all message reads/status changes by `teacher_id`.
- The assigned teacher can triage messages in `/teacher/feedback`. The main dashboard shows a count of new messages, refreshing once per minute while open. This is an in-app inbox only; no email/push notification is configured.
- The private student/parent grade report now displays entered class-scorebook assessment scores, with subject/term/category context, along with existing legacy Quiz/Activity/Exam records. Empty gradebook cells are omitted, not shown as zero.
- Adviser names are derived from `teacher_sections.teacher_id` and displayed on class registration choices, registration confirmation, and verified student reports. The section ownership relationship is the assignment source of truth.

Additional testing before production: apply `20261015_subject_roster_parent_feedback.sql` after the class scorebook migration in staging, verify two teacher accounts cannot cross-read/modify feedback, validate subject seeding does not overwrite existing term marks, and confirm the parent view cannot access other students' scores. Full package type-check and production build remain unverified here because dependency installation could not complete in this environment.


## Follow-up implementation: three terms and mobile usability

- Standardized all active runtime grade fields and API keys to `term_1`, `term_2`, `term_3`, and `term_number`. Only Term 1, Term 2, and Term 3 are offered or displayed in the current application. Old column names are retained only in upgrade/compatibility SQL so stored grades can be migrated without loss.
- Added `supabase/migrations/20261015_terms_mobile_ux.sql` to rename stored grade columns and scorebook period keys, constrain assessments to terms 1–3, and remap older fourth-period assessments to Term 3 while preserving assessment and score IDs. A colliding assessment name is renamed with an “Earlier record” suffix rather than deleting the score.
- Added a prominent Teacher sign-in link beside Student portal and retained a clear homepage registration CTA. The student page shows distinct, explanatory options for viewing grades and registering.
- Reworked the scorebook for narrow viewports to use stacked student cards and larger tap targets; converted the teacher roster and student grade/assessment reports to labeled cards on mobile, and added scroll-to-editor behavior when choosing a student on a phone.
- Basic verification passed: 38 TypeScript/TSX files transpile without syntax diagnostics, the stylesheet's braces are balanced, and the active TypeScript tree contains no legacy semester/quarter/grading_period terms. A full Next.js production build and execution of the SQL migration against a live Supabase database were not run in this environment. Apply the migration in staging and run `npm ci`, `npm run typecheck`, and `npm run build` before production rollout.
