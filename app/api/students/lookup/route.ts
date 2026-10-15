import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, createStudentFeedbackTicket, digestStudentAccess, digestStudentPin, jsonError } from "@/lib/server/security";
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
      .select("id, full_name, avatar_path, avatar_webp_data_url, pin_digest, section_id, section:teacher_sections(teacher_id, grade_level, section_name, academic_year)")
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

    const joinedSection = Array.isArray(student.section) ? student.section[0] : student.section;
    if (!joinedSection?.teacher_id) return jsonError("This student record has no assigned class adviser. Please contact the school office.", 409);
    const { data: adviserProfile, error: adviserError } = await admin
      .from("teacher_profiles")
      .select("full_name")
      .eq("id", joinedSection.teacher_id)
      .maybeSingle();
    if (adviserError) throw adviserError;

    const [gradeResult, assessmentResult, scorebookAssessmentResult, catalogueResult, commentResult] = await Promise.all([
      admin.from("subject_grades")
        .select("id, subject_name, term_1, term_2, term_3, updated_at")
        .eq("student_id", student.id)
        .order("subject_name"),
      admin.from("student_assessments")
        .select("id, category, assessment_name, score, max_score, assessed_on, updated_at")
        .eq("student_id", student.id)
        .order("assessed_on", { ascending: false })
        .order("updated_at", { ascending: false }),
      admin.from("gradebook_assessments")
        .select("id, subject_name, term_number, category, assessment_name, max_score, assessed_on, created_at")
        .eq("section_id", student.section_id)
        .order("term_number", { ascending: true })
        .order("assessed_on", { ascending: false }),
      admin.from("gradebook_subjects")
        .select("subject_name")
        .eq("section_id", student.section_id)
        .order("subject_name", { ascending: true }),
      admin.from("student_teacher_comments")
        .select("comment, updated_at")
        .eq("student_id", student.id)
        .maybeSingle()
    ]);
    if (gradeResult.error) throw gradeResult.error;
    if (assessmentResult.error) throw assessmentResult.error;
    if (scorebookAssessmentResult.error) throw scorebookAssessmentResult.error;
    if (catalogueResult.error) throw catalogueResult.error;
    if (commentResult.error) throw commentResult.error;

    const scorebookAssessmentIds = (scorebookAssessmentResult.data ?? []).map((assessment) => assessment.id);
    const { data: scorebookScores, error: scorebookScoreError } = scorebookAssessmentIds.length
      ? await admin.from("gradebook_scores")
          .select("assessment_id, score, updated_at")
          .eq("student_id", student.id)
          .in("assessment_id", scorebookAssessmentIds)
          .not("score", "is", null)
      : { data: [], error: null };
    if (scorebookScoreError) throw scorebookScoreError;
    const grades = gradeResult.data;
    const subjects = (grades ?? []).map((grade) => {
      const terms = [grade.term_1, grade.term_2, grade.term_3]
        .map((value) => value === null ? null : Number(value));
      const scored = terms.filter((value): value is number => value !== null && Number.isFinite(value));
      return {
        id: grade.id,
        subject: grade.subject_name,
        terms,
        finalGrade: scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null,
        updatedAt: grade.updated_at
      };
    });
    const legacyAssessments = (assessmentResult.data ?? []).map((assessment) => ({
      id: `legacy-${assessment.id}`,
      category: assessment.category as "Quiz" | "Activity" | "Exam",
      name: assessment.assessment_name,
      score: Number(assessment.score),
      maxScore: Number(assessment.max_score),
      assessedOn: assessment.assessed_on,
      updatedAt: assessment.updated_at,
      subject: null as string | null,
      termNumber: null as number | null,
      source: "legacy" as const
    }));
    const scoreByAssessment = new Map((scorebookScores ?? []).map((score) => [score.assessment_id, score]));
    const classScorebookAssessments = (scorebookAssessmentResult.data ?? []).flatMap((assessment) => {
      const score = scoreByAssessment.get(assessment.id);
      // Unentered score cells are intentionally not exposed as zero; only actual teacher-entered scores appear.
      if (!score || score.score === null) return [];
      return [{
        id: `scorebook-${assessment.id}`,
        category: assessment.category as "Written Works" | "Performance Tasks" | "Summative Test/Exam",
        name: assessment.assessment_name,
        score: Number(score.score),
        maxScore: Number(assessment.max_score),
        assessedOn: assessment.assessed_on,
        updatedAt: score.updated_at ?? assessment.created_at,
        subject: assessment.subject_name,
        termNumber: Number(assessment.term_number),
        source: "scorebook" as const
      }];
    });
    const assessments = [...legacyAssessments, ...classScorebookAssessments]
      .sort((left, right) => right.assessedOn.localeCompare(left.assessedOn) || right.updatedAt.localeCompare(left.updatedAt));
    let avatar = student.avatar_webp_data_url;
    if (student.avatar_path) {
      const { data: signedPhoto, error: signedPhotoError } = await admin.storage.from("profile-photos").createSignedUrl(student.avatar_path, 3600);
      if (signedPhotoError) throw signedPhotoError;
      avatar = signedPhoto.signedUrl;
    }
    const response = Response.json({
      student: {
        fullName: student.full_name,
        avatar,
        section: {
          grade_level: joinedSection.grade_level,
          section_name: joinedSection.section_name,
          academic_year: joinedSection.academic_year
        },
        adviserName: adviserProfile?.full_name?.trim() || "Class adviser not listed"
      },
      subjects,
      availableSubjects: (catalogueResult.data ?? []).map((row) => row.subject_name),
      assessments,
      teacherComment: commentResult.data?.comment ?? null,
      commentUpdatedAt: commentResult.data?.updated_at ?? null
    }, { headers: { "Cache-Control": "no-store, private" } });
    const ticket = createStudentFeedbackTicket(student.id);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append("Set-Cookie", `snhs_feedback_ticket=${ticket}; Path=/api/students/feedback; HttpOnly; SameSite=Strict; Max-Age=900${secure}`);
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("The grade lookup could not be read.");
    return jsonError("Grade lookup is temporarily unavailable. Please try again shortly.", 503);
  }
}
