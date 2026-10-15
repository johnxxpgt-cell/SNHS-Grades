# Term and Mobile UX Update

## User-facing changes

- All grading period selection and report labels now use **Term 1**, **Term 2**, and **Term 3**.
- The current API and schema keys are `term_1`, `term_2`, `term_3`, and `term_number`.
- Homepage navigation includes direct links to student registration and teacher sign-in/registration.
- The student portal presents two large choices: “View my grades” for returning students and “Register here” for new students. Registration instructions explain the sequence and tell students what to do if their teacher has not opened a section.
- The teacher scorebook uses touch-friendly student cards and assessment fields on mobile. The desktop spreadsheet remains available at wider sizes.
- Grade and assessment reports become labeled cards on small screens to avoid unnecessary horizontal scrolling.

## Existing database upgrade

1. Back up the production Supabase database.
2. Verify the prior scorebook and subject/feedback migrations are already applied.
3. Apply `supabase/migrations/20261015_terms_mobile_ux.sql` once.
4. Deploy the matching application source after the migration succeeds.
5. Check Term 1–3 legacy grades and review scorebook Term 3 for former period-4 assessments. Scores are retained; only colliding assessment names may receive an “Earlier record” suffix.
6. Test as two different teachers and confirm that section-level permissions remain enforced.

## Fresh Supabase project

Use the current `supabase/schema.sql` and do not replay this upgrade migration on top of a fresh schema.

## Local checks

Run `npm ci`, `npm run typecheck`, and `npm run build` from a network-enabled environment. Test phone layouts at 320 px, 375 px, and 768 px. The migration should be tested in staging before production.


## Student profile photos and grade-table defaults

Subject grades are collapsed by default on the student dashboard. New student registrations require a profile photo, which the browser converts to WebP before sending to the server. The registration API also validates the WebP signature and enforces the 2 MB limit. Students registered before this change can upload or change a photo from the profile image on their dashboard; hover/focus shows the upload action on desktop, and a visible caption makes the same action clear on touch screens. Student photo uploads use the authenticated HTTP-only student session and private Supabase Storage.
