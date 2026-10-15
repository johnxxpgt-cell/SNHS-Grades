# Class Scorebook and Parent Feedback Update

## What changed

- Added `components/class-scorebook.tsx`, reachable through **Open class scorebook** on `/teacher`.
- Added a section-specific subject catalog; teachers type and save a subject once, then choose it through a dropdown on later visits.
- Added a one-click **Add subject to grade roster** action that adds blank legacy term-grade rows to students in the selected section without replacing any existing marks.
- Added a database trigger that initializes saved subject rows for newly registered students, while the class scorebook assessment grid automatically follows `students.section_id`.
- Added assessment columns for Written Works, Performance Tasks, and Summative Test/Exam; term selector; student-by-assessment entry grid; maximum-score validation; bulk save; and clear blank-vs-zero behavior.
- Added `components/parent-feedback-inbox.tsx` and `/teacher/feedback`. Parents/guardians can send consented feedback from a verified grade report, and it is routed to the teacher who owns the student's registered section.
- Encrypts guardian name and message before writing to `student_parent_feedback`. The direct table is inaccessible to `anon` and `authenticated`; only server routes using Supabase service credentials can read or write the message content.
- Added authenticated inbox endpoints for messages/status and a new-message count badge on the teacher dashboard (refreshes every 60 seconds while the dashboard remains open). This release uses an in-app inbox; it does not send email notifications.
- Displays the adviser name in public active-section choices, registration confirmation and the private grade report, derived from the registered section's teacher owner.
- Updated the student grade report to show entered scorebook assessments with their subject and term, plus existing legacy Quiz/Activity/Exam records. Blank score cells are not represented as zero.
- Preserved the existing term-grade editor, individual Quiz/Activity/Exam input, registration/lookup, contact, SEO and security flows.

## Required existing-project migration

Apply the migrations that are not yet installed, in order:

1. `supabase/migrations/20261015_privacy_contact.sql` (if not already applied)
2. `supabase/migrations/20261015_class_scorebook.sql`
3. `supabase/migrations/20261015_subject_roster_parent_feedback.sql`
4. `supabase/migrations/20261015_terms_mobile_ux.sql`

The fourth migration switches active grade columns and assessment keys to `term_1`, `term_2`, `term_3`, and `term_number`. It maps old assessment period 4 to Term 3 and preserves the scores, adding an “Earlier record” suffix only when assessment names collide during the migration. Check Term 3 after running it.

For a fresh project, `supabase/schema.sql` includes the full schema and new functions/triggers. Do not run the fresh-install schema over an existing populated database without reviewing it first.

## Teacher workflow

1. Sign in at `/teacher` and choose your section.
2. Click **Open class scorebook**.
3. Type a subject once and click **Save subject**. It is stored for that section and becomes available in the dropdown on future visits.
4. Choose the saved subject and term, then add assessment columns and enter scores.
5. Click **Add subject to grade roster** to create blank legacy term-grade rows for students in that section who do not yet have that subject. Existing subject rows and marks are preserved.
6. Save changed score cells. The student/parent grade report shows recorded scorebook scores after a successful private lookup.
7. Use **Parent feedback inbox** on the teacher dashboard to read and triage incoming messages routed to your section. New-message counts refresh every minute while the dashboard is open.

## Grade calculation limitation

The page calculates a weighted **initial score** using a selected suggested profile:

- Mathematics / Science: Written Works 40%, Performance Tasks 40%, Summative Test/Exam 20%.
- Languages / AP / Values: 30%, 50%, 20%.
- MAPEH / TLE: 20%, 60%, 20%.

These are configurable suggestions and must be confirmed against the school's approved policy. The page does not apply an approved transmutation table or automatically write a final term grade into the legacy term-grade fields. Do not treat the weighted initial score as an official term grade until the school's weights and transmutation rules are validated.

## Parent feedback / routing notes

- The sender must first successfully look up a student grade report with the registered name, LRN and PIN; a short-lived signed HTTP-only cookie enables feedback submission for 15 minutes.
- The section owner in `teacher_sections.teacher_id` determines the adviser and message recipient; the submission cannot specify a different teacher.
- Guardian name/message ciphertext is stored in `student_parent_feedback` and is decrypted only in the authenticated assigned teacher's inbox API.
- The inbox is in-app only. There is no automatic email sending or push notification in this release.
- New student registrations receive blank rows for all subjects already saved for their section. Existing students receive new subjects through the one-click roster action.

## Term labels and mobile experience

- All grading-period selectors and student-facing reports now show **Term 1**, **Term 2**, and **Term 3** only.
- The active database/API fields use `term_1`, `term_2`, `term_3`, and `term_number`; old semester/quarter names remain only in historical compatibility migrations.
- Student registration and grade lookup are shown as two clear choices; the home page also has explicit student registration and teacher sign-in links.
- On mobile, the teacher scorebook changes from a wide table to stacked assessment and student cards with larger score fields; grade reports use cards with visible labels.

## Verification status

- A TypeScript/TSX syntax-transpilation pass completed for all 38 TypeScript source files with no syntax diagnostics.
- A full `npm run typecheck` and `npm run build` remain unverified in this environment because package installation failed while resolving dependencies. Run `npm ci`, `npm run typecheck`, and `npm run build` from a network-enabled machine before production deployment.
- Apply the new Supabase migration to a test project and verify two teachers cannot view or update each other's parent feedback, a parent can only submit after a successful grade lookup, and subject seeding preserves existing marks before deploying to production.
