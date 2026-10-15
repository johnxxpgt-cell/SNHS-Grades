# Student Profile Photo and Grade Table Update

## Changes

- Subject grades in the private student dashboard are collapsed by default. Students can expand the section to view Term 1, Term 2, Term 3, and Final grades.
- A profile photo is required when registering a new student.
- Registration converts the chosen image to WebP in the browser, then the registration API validates the file signature and enforces a 2 MB maximum before saving it to the private Supabase Storage bucket.
- Students who registered before this change can add or change their photo from the profile image on `/student/dashboard`.
- On desktop, hovering or keyboard-focusing the avatar displays an `Upload photo` or `Change photo` overlay. On touch devices, the caption beneath the avatar remains visible.
- The profile upload API verifies the signed HTTP-only student session, rate-limits updates, stores a new WebP file, updates the student's avatar path, and removes the previous file after the database update succeeds.
- The Privacy Policy now reflects that profile photos are required for new registrations.

## Deployment

No Supabase schema migration is needed. Preserve the existing environment variables and previously applied migrations. Run `npm ci`, `npm run typecheck`, and `npm run build` before deploying.
