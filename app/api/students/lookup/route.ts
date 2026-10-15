import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, digestStudentAccess, digestStudentPin, jsonError } from "@/lib/server/security";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!(await allowRequest(request, "student-grade-lookup", 10, 900))) {
      return jsonError("Too many attempts. Please wait a few minutes and try again.", 429);
    }
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase("en");
    if (contentType !== "application/json") return jsonError("Send the grade lookup as JSON.", 415);
    const rawText = await request.text();
    if (rawText.length > 4096) return jsonError("The grade lookup request is too large.", 413);
    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return jsonError("The grade lookup could not be read.");
    }
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return jsonError("The grade lookup could not be read.");
    const body = rawBody as { fullName?: unknown; lrn?: unknown; pin?: unknown; privacyConsent?: unknown; privacyNoticeVersion?: unknown };
    if (body.privacyConsent !== true || body.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION) {
      return jsonError("Please review the Privacy Policy and confirm acknowledgement before looking up grades.", 400);
    }
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
    const lrn = typeof body.lrn === "string" ? body.lrn.replace(/\D/g, "") : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (fullName.length < 3 || fullName.length > 120 || lrn.length < 8 || lrn.length > 20 || !/^\d{4}$/.test(pin)) {
      return jsonError("We couldn’t match those details. Check your full name, LRN, and 4-digit PIN.", 401);
    }

    const admin = getSupabaseAdmin();
    const accessDigest = digestStudentAccess(fullName, lrn);
    if (!(await allowRequest(request, "student-grade-pin", 5, 900, accessDigest))) {
      return jsonError("Too many PIN attempts for this student record. Please wait 15 minutes and try again.", 429);
    }
    const { data: student, error } = await admin
      .from("students")
      .select("id, full_name, avatar_path, avatar_webp_data_url, pin_digest, section:teacher_sections(grade_level, section_name, academic_year)")
      .eq("access_digest", accessDigest)
      .maybeSingle();
    if (error) throw error;
    if (!student) return jsonError("We couldn’t match those details. Check your full name, LRN, and 4-digit PIN.", 401);

    const suppliedPinDigest = digestStudentPin(pin, accessDigest);
    const savedPinDigest = typeof student.pin_digest === "string" ? student.pin_digest.trim() : "";
    if (savedPinDigest) {
      const savedDigestBytes = Buffer.from(savedPinDigest, "hex");
      const suppliedDigestBytes = Buffer.from(suppliedPinDigest, "hex");
      if (savedDigestBytes.length !== suppliedDigestBytes.length || !timingSafeEqual(savedDigestBytes, suppliedDigestBytes)) {
        return jsonError("We couldn’t match those details. Check your full name, LRN, and 4-digit PIN.", 401);
      }
    } else {
      // Existing records from before PINs were introduced can set one on their first successful lookup.
      const { data: claimedRecord, error: claimError } = await admin
        .from("students")
        .update({ pin_digest: suppliedPinDigest })
        .eq("id", student.id)
        .is("pin_digest", null)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimedRecord) {
        const { data: currentRecord, error: currentError } = await admin
          .from("students")
          .select("pin_digest")
          .eq("id", student.id)
          .maybeSingle();
        if (currentError) throw currentError;
        const currentPinDigest = typeof currentRecord?.pin_digest === "string" ? currentRecord.pin_digest.trim() : "";
        const currentDigestBytes = Buffer.from(currentPinDigest, "hex");
        const suppliedDigestBytes = Buffer.from(suppliedPinDigest, "hex");
        if (currentDigestBytes.length !== suppliedDigestBytes.length || !timingSafeEqual(currentDigestBytes, suppliedDigestBytes)) {
          return jsonError("We couldn’t match those details. Check your full name, LRN, and 4-digit PIN.", 401);
        }
      }
    }

    const [gradeResult, assessmentResult, commentResult] = await Promise.all([
      admin.from("subject_grades")
        .select("id, subject_name, semester_1, semester_2, semester_3, updated_at")
        .eq("student_id", student.id)
        .order("subject_name"),
      admin.from("student_assessments")
        .select("id, category, assessment_name, score, max_score, assessed_on, updated_at")
        .eq("student_id", student.id)
        .order("assessed_on", { ascending: false })
        .order("updated_at", { ascending: false }),
      admin.from("student_teacher_comments")
        .select("comment, updated_at")
        .eq("student_id", student.id)
        .maybeSingle()
    ]);
    if (gradeResult.error) throw gradeResult.error;
    if (assessmentResult.error) throw assessmentResult.error;
    if (commentResult.error) throw commentResult.error;
    const grades = gradeResult.data;
    const subjects = (grades ?? []).map((grade) => {
      const semesters = [grade.semester_1, grade.semester_2, grade.semester_3]
        .map((value) => value === null ? null : Number(value));
      const scored = semesters.filter((value): value is number => value !== null && Number.isFinite(value));
      return {
        id: grade.id,
        subject: grade.subject_name,
        semesters,
        finalGrade: scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null,
        updatedAt: grade.updated_at
      };
    });
    const assessments = (assessmentResult.data ?? []).map((assessment) => ({
      id: assessment.id,
      category: assessment.category,
      name: assessment.assessment_name,
      score: Number(assessment.score),
      maxScore: Number(assessment.max_score),
      assessedOn: assessment.assessed_on,
      updatedAt: assessment.updated_at
    }));
    let avatar = student.avatar_webp_data_url;
    if (student.avatar_path) {
      const { data: signedPhoto, error: signedPhotoError } = await admin.storage.from("profile-photos").createSignedUrl(student.avatar_path, 3600);
      if (signedPhotoError) throw signedPhotoError;
      avatar = signedPhoto.signedUrl;
    }
    return Response.json({
      student: {
        fullName: student.full_name,
        avatar,
        section: student.section
      },
      subjects,
      assessments,
      teacherComment: commentResult.data?.comment ?? null,
      commentUpdatedAt: commentResult.data?.updated_at ?? null
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("The grade lookup could not be read.");
    return jsonError("Grade lookup is temporarily unavailable. Please try again shortly.", 503);
  }
}
