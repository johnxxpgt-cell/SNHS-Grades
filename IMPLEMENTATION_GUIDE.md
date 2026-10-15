# Implementation Guide — SNHS Gradebook

## 1. Files added or updated

```text
app/
  api/contact/route.ts             # Public POST; protected GET/PATCH inbox API
  api/parent-feedback/route.ts     # Assigned-teacher inbox/count/status API
  api/sections/route.ts            # Active registration sections with derived adviser names
  api/students/feedback/route.ts   # Encrypted guardian feedback POST
  api/students/lookup/route.ts    # Private grade lookup + feedback ticket
  auth/callback/layout.tsx         # No-index metadata for auth callback
  contact/page.tsx                 # Contact page and metadata
  not-found.tsx                    # Custom 404
  opengraph-image.tsx              # Generated 1200×630 social image
  privacy/page.tsx                 # Privacy Policy draft
  robots.ts                        # Crawler rules
  sitemap.ts                       # Public-page sitemap
  student/page.tsx                 # Improved metadata, noindex
  teacher/page.tsx                 # Improved metadata, noindex
  teacher/messages/page.tsx        # Restricted contact inbox view, noindex
  teacher/feedback/page.tsx        # Assigned parent/guardian feedback inbox, noindex
  terms/page.tsx                   # Terms of Service draft
components/
  class-scorebook.tsx              # Whole-class assessment grid, saved subjects, roster seeding
  parent-feedback-inbox.tsx        # Teacher inbox for encrypted parent feedback
  analytics-consent.tsx            # GA4 opt-in; manual public-page views only
  breadcrumbs.tsx                  # Accessible reusable breadcrumbs
  contact-form.tsx                 # Validated contact submission UI
  contact-inbox.tsx                # Authenticated inbox UI
lib/
  constants.ts                     # Shared privacy-notice version
  server/security.ts               # AES-256-GCM generic field encrypt/decrypt helpers
supabase/
  schema.sql                       # Fresh-install schema, including scorebook/subject/feedback features
  migrations/20261015_privacy_contact.sql
  migrations/20261015_class_scorebook.sql # Class-wide assessment definitions and per-student scores with RLS
  migrations/20261015_subject_roster_parent_feedback.sql # Subject catalogue, safe roster seeding, encrypted parent feedback
next.config.ts                     # Additional security headers
.env.example                       # New optional SEO/analytics/contact settings
AUDIT_REPORT.md                    # Audit categories and residual risks
IMPLEMENTATION_GUIDE.md            # This setup and validation guide
```

## 2. Install and run locally

From the project root:

```bash
npm ci
cp .env.example .env.local
```

Set valid Supabase URL, browser publishable key and server secret key. Set `NEXT_PUBLIC_APP_URL` to the real public production origin; the app can fall back to Vercel-provided host metadata when available, but this value should be explicitly set for stable canonicals. Generate independent stable values for the HMAC secret, birthday key and contact-encryption key:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Put the first value in `SUPABASE_LRN_HMAC_SECRET` (base64 text is acceptable as a high-entropy UTF-8 secret, and must be at least 32 bytes), the second in `SUPABASE_DATA_ENCRYPTION_KEY` (32 random bytes encoded as base64), and the third in `SUPABASE_CONTACT_ENCRYPTION_KEY` (also 32 random bytes encoded as base64). Contact form data and student birthdays deliberately use separate encryption keys. Do not rotate existing HMAC/AES keys without an explicit migration plan; doing so can break access to existing records.

Configure these environment variables:

| Variable | Use |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Absolute production origin for the real school domain or chosen Vercel project domain. Do not leave the localhost value in production. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key; never prefix with `NEXT_PUBLIC_` |
| `SUPABASE_LRN_HMAC_SECRET` | Stable server-only keyed digest secret |
| `SUPABASE_DATA_ENCRYPTION_KEY` | Stable server-only base64-encoded 32-byte AES key for birthdays |
| `SUPABASE_CONTACT_ENCRYPTION_KEY` | Separate stable server-only base64-encoded 32-byte AES key for contact fields |
| `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` | Official monitored school privacy contact; this is intentionally public on the notice pages |
| `SUPABASE_CONTACT_ADMIN_EMAILS` | Comma-separated allowlist of Supabase-authenticated email addresses allowed to read/decrypt contact inquiries |
| `GOOGLE_SITE_VERIFICATION` | Token from Google Search Console; leave blank until verified |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 measurement ID, e.g. `G-...`; leave blank to disable analytics |

Never commit `.env.local`. The `.gitignore` already ignores `.env*` except `.env.example`. Environment variables cannot be made secret by encrypting them in client code; keep server-only values in Vercel's environment settings and Supabase's secret configuration.

## 3. Apply the Supabase SQL

- **Fresh Supabase project:** run `supabase/schema.sql` in the Supabase SQL Editor. It includes the existing portal schema, contact submission storage, and the new class scorebook tables.
- **Existing project:** apply only migrations not yet installed, in dependency order: `supabase/migrations/20261015_privacy_contact.sql` (if missing), `supabase/migrations/20261015_class_scorebook.sql`, and `supabase/migrations/20261015_subject_roster_parent_feedback.sql`. The subject/feedback migration depends on the `gradebook_assessments` and `gradebook_scores` tables created by the scorebook migration. These migrations are additive; review your migration history before running them.

Contact submissions are stored in `public.contact_submissions` with the name, email, subject and message encrypted by the server before insert using `SUPABASE_CONTACT_ENCRYPTION_KEY`, separate from the student birthday key. The table has RLS enabled and grants no direct access to `anon` or `authenticated` roles. The trusted server uses `service_role`; do not put that key in the browser.

## 4. Deploy to Vercel

Add the environment variables in the Vercel project settings, then redeploy. Make sure `NEXT_PUBLIC_APP_URL` matches the actual canonical production origin and configure the same origin plus `/auth/callback` in Supabase Auth's allowed redirect URLs.

For local validation:

```bash
npm run dev
npm run build
npm start
```

`npm ci`/`npm run build` should be run in a network-enabled build environment with the correct platform-specific Next.js SWC package. The uploaded archive's included `node_modules` was built on Windows, so it is not a substitute for installing dependencies on Linux.

## 5. Google integrations

**Search Console:** verify the production property using the HTML meta-tag method, copy only the verification token into `GOOGLE_SITE_VERIFICATION`, redeploy, then submit `https://YOUR_PRODUCTION_HOST/sitemap.xml`. Check that `/robots.txt` references that same sitemap and that all canonical URLs use the production HTTPS origin.

**Google Analytics 4:** create a GA4 web stream, copy its measurement ID into `NEXT_PUBLIC_GA_MEASUREMENT_ID`, redeploy, then test Accept and Reject in a clean browser session. Tracking stays disabled until consent is accepted, and consent is set to denied again when navigating to a non-public route. In the GA4 web-stream settings, disable automatic pageview/history-change collection and other Enhanced Measurement events if enabled, because this app intentionally sends manual pageviews only from `/`, `/contact`, `/privacy`, and `/terms`. Do not create analytics events containing student names, LRNs, grades, form content, or other private values.

## 6. Contact inbox

The public contact page posts to `POST /api/contact`. Requests are size-limited, validated, consent-version checked, rate-limited, and encrypted before insertion. Messages can be reviewed at `/teacher/messages` by signing in with an account whose email is explicitly included in `SUPABASE_CONTACT_ADMIN_EMAILS`.

The inbox uses:

- `GET /api/contact` to decrypt and return at most the 50 most recent inquiries;
- `PATCH /api/contact` to move a message among `new`, `in_review`, and `closed`.

GET, PATCH and DELETE require a valid Supabase access token and an allowlisted email. DELETE permanently removes the selected inquiry after a confirmation prompt. `service_role` database access alone does not make an account an inbox administrator; the explicit email allowlist is checked by the API. There is no automatic retention job yet; schedule regular cleanup or document an administrative review cadence before launch.

## 7. Redirect policy

No redirect was guessed because no broken legacy URL was established in the supplied source. If analytics, Search Console or access logs identify a real obsolete path, add only the verified mapping in `next.config.ts`, for example:

```ts
async redirects() {
  return [
    { source: "/verified-old-path", destination: "/current-path", permanent: true }
  ];
}
```

Replace both paths with actual legacy/current routes; do not deploy the example literally.

## 8. Verification checklist

1. `npm run typecheck` passes.
2. `npm run build` completes in a network-enabled environment.
3. `/`, `/contact`, `/privacy`, `/terms`, `/student`, `/teacher`, `/teacher/messages`, `/auth/callback` and a random invalid path render appropriately.
4. Public pages have a single page-specific H1, unique title/description, canonical URL and OG metadata. Student, teacher, callback and inbox pages have `noindex` metadata.
5. `/robots.txt` disallows private routes and points to `/sitemap.xml`; the sitemap contains only `/`, `/contact`, `/privacy`, `/terms`.
6. Contact form submissions are visible as ciphertext in the database and readable only in `/teacher/messages` for an allowlisted authenticated account.
7. Invalid/missing contact consent is rejected; repeated submissions receive rate limiting; logs do not include contact message values.
8. Student lookup/registration and teacher signup require privacy acknowledgement; student registration stores the privacy-notice version/time.
9. Search Console and GA4 work only after valid IDs are configured. Confirm GA4 does not collect private route paths or form/grade data.
10. Apply the class scorebook migration and verify a teacher can create, edit, reload, and delete assessment columns only inside their own section. Try a score above its maximum and a student from another section; the database must reject both.
11. Review `AUDIT_REPORT.md` and complete the legal/security launch blockers before production.

## 9. Legal/security note

The included Privacy Policy and Terms are tailored implementation drafts, not a warranty that the service strictly complies with every applicable law or DepEd/NPC obligation. The responsible controller and privacy contact, lawful bases, education-record retention, guardian authorization and incident obligations must be confirmed by the school. The current teacher UI directly queries names and grade records through Supabase with row-level security, so those existing fields are not application-field encrypted. Do not represent them as individually encrypted until a separate server-side migration/refactor is designed and verified.


## 10. Saved subjects, parent feedback and class adviser

### Subject dropdown and one-click grade roster

Teachers save a subject once with `create_gradebook_subject`; `gradebook_subjects` is scoped to a section and enforces case-insensitive duplicate prevention after trimming. The scorebook dropdown loads from this saved catalog on later visits. **Add subject to grade roster** invokes `add_subject_to_section_roster`, which adds blank rows to `subject_grades` only when no row for that student/subject already exists. It does not replace any semester grades. A database trigger seeds existing catalog subjects for students who register later.

Test with a non-production section first: save a new subject, reopen the scorebook and verify the dropdown; click Add subject to grade roster; check the `subject_grades` rows for that section; then enter some existing marks and click the button again to confirm those marks remain unchanged. Register a test student after the subject exists and verify blank rows were initialized automatically.

### Parent/guardian grade feedback

A successful `/api/students/lookup` response sets an HTTP-only, `SameSite=Strict`, 15-minute signed cookie scoped to `/api/students/feedback`. The form requires a guardian name, message and privacy acknowledgement. The feedback endpoint derives the student and target teacher from this signed token and the student's current section; callers cannot supply a recipient `teacher_id`. The name and message are AES-256-GCM encrypted using `SUPABASE_CONTACT_ENCRYPTION_KEY` before insert. Keep that key stable and backup it securely; lost/rotated keys make saved messages unreadable.

Feedback is held in `public.student_parent_feedback`, which has RLS enabled and no direct grants to `anon` or `authenticated`. Only the server APIs use the Supabase service key to read/decrypt it. `/api/parent-feedback` validates the teacher's Supabase bearer token and filters every query/update by that teacher's user ID. `/teacher/feedback` is the teacher UI; the dashboard new-message count refreshes every 60 seconds while open. This build provides an in-app inbox and count, not email notifications. If email or SMS notifications are later added, send only a generic notification and keep the student's grades and message body out of email subject/body unless the school approves the necessary privacy controls.

### Adviser assignment and parent-facing assessments

The registered section's `teacher_sections.teacher_id` is the single source of truth for adviser assignment. The registration selector, registration confirmation and student grade report derive the display name from that teacher's `teacher_profiles` record. Do not accept adviser/teacher ID from the client as registration authority. The private grade lookup joins the student's class-scorebook assessments with only that student's saved `gradebook_scores`; blank assessment cells are omitted instead of shown as zero. Existing Quiz/Activity/Exam entries continue to display as legacy classwork.

### Added verification checks

1. Apply the subject/feedback migration in a staging database before deploying the UI.
2. Verify the subject catalog cannot be created/read/rostered for a different teacher's section, and that the existing RLS/function ownership limits the RPC to `auth.uid()` owning the section.
3. Verify newly registered students are assigned the adviser from their selected section, not a client-supplied teacher ID.
4. Look up a test student and send feedback; confirm ciphertext (not plaintext) is stored in `student_parent_feedback` and that only the owning teacher can decrypt/view it.
5. Sign in as another teacher and verify their inbox returns no feedback from the first teacher's sections and cannot update that message's status.
6. Confirm the teacher dashboard new-feedback count updates on refresh/poll and message status changes from new to in review/resolved.
7. Confirm the student-facing assessment table includes only recorded scores for the current student and does not turn blank cells into zero.
8. Ensure `SUPABASE_LRN_HMAC_SECRET`, `SUPABASE_DATA_ENCRYPTION_KEY`, `SUPABASE_CONTACT_ENCRYPTION_KEY`, and Supabase service credentials are stable and server-only.
