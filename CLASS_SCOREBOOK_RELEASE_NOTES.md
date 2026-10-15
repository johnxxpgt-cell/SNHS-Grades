# Class Scorebook Update

## What changed

- Added `components/class-scorebook.tsx`, reachable through **Open class scorebook** on `/teacher`.
- Added subject + quarter selection (Quarter 1–4).
- Added assessment columns for Written Works, Performance Tasks, and Summative Test/Exam.
- Added student-by-assessment input grid with maximum-score validation and bulk save for changed cells.
- Kept empty score cells distinct from genuine zero scores and display the number of missing score cells.
- Added suggested WW/PT/Summative weighting profiles and weighted initial-score display when all three categories exist and every assessment score for that student is entered.
- Added `gradebook_assessments` and `gradebook_scores` tables with RLS. A database trigger blocks scores above the maximum and prevents scores from being assigned to students outside the assessment's class section.
- Preserved the existing semester-grade editor, Quiz/Activity/Exam input, student registration/lookup, contact, and SEO/security features.

## Required existing-project migration

Run in Supabase SQL Editor after the earlier schema and privacy/contact migration:

`supabase/migrations/20261015_class_scorebook.sql`

For a fresh project, `supabase/schema.sql` now includes this scorebook schema too. Do not run a fresh-install schema over an existing populated database without reviewing it first.

## Where teachers find it

1. Sign in at `/teacher`.
2. Choose the class section.
3. Click **Open class scorebook**.
4. Enter a subject and grading period, then click **Load subject & quarter**.
5. Add assessment columns and enter student scores.
6. Click **Save changed cells**.

## Grade calculation limitation

The page calculates a weighted **initial score** using a selected suggested profile:

- Mathematics / Science: Written Works 40%, Performance Tasks 40%, Summative Test/Exam 20%.
- Languages / AP / Values: 30%, 50%, 20%.
- MAPEH / TLE: 20%, 60%, 20%.

These are configurable suggestions and must be confirmed against the school's approved policy. The new view does not yet apply a school-approved transmutation table, write final values to the legacy semester/term grade table, or publish the scorebook records in the student portal. Do not treat the calculated initial score as the official quarterly grade until those remaining policy/integration pieces have been implemented and tested.

## Verification status

- TypeScript/TSX syntax-transpilation check passed for the touched teacher portal and the new scorebook component.
- A full `npm run typecheck` and `npm run build` were not completed in this environment because npm registry DNS access failed while resolving dependencies. Run `npm ci`, `npm run typecheck`, and `npm run build` from a network-enabled machine before production deployment.
