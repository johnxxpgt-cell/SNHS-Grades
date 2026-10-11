import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, digestStudentAccess, jsonError } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!(await allowRequest(request, "student-grade-lookup", 10, 900))) {
      return jsonError("Too many attempts. Please wait a few minutes and try again.", 429);
    }
    const rawBody: unknown = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return jsonError("The grade lookup could not be read.");
    const body = rawBody as { fullName?: unknown; lrn?: unknown };
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
    const lrn = typeof body.lrn === "string" ? body.lrn.replace(/\D/g, "") : "";
    if (fullName.length < 3 || fullName.length > 120 || lrn.length < 8 || lrn.length > 20) {
      return jsonError("We couldn’t match those details. Check your full name and LRN.", 401);
    }

    const admin = getSupabaseAdmin();
    const accessDigest = digestStudentAccess(fullName, lrn);
    const { data: student, error } = await admin
      .from("students")
      .select("id, full_name, avatar_webp_data_url, section:teacher_sections(grade_level, section_name, academic_year)")
      .eq("access_digest", accessDigest)
      .maybeSingle();
    if (error) throw error;
    if (!student) return jsonError("We couldn’t match those details. Check your full name and LRN.", 401);

    const { data: grades, error: gradeError } = await admin
      .from("subject_grades")
      .select("id, subject_name, quarter_1, quarter_2, quarter_3, quarter_4, updated_at")
      .eq("student_id", student.id)
      .order("subject_name");
    if (gradeError) throw gradeError;
    const subjects = (grades ?? []).map((grade) => {
      const quarters = [grade.quarter_1, grade.quarter_2, grade.quarter_3, grade.quarter_4]
        .map((value) => value === null ? null : Number(value));
      const scored = quarters.filter((value): value is number => value !== null && Number.isFinite(value));
      return {
        id: grade.id,
        subject: grade.subject_name,
        quarters,
        finalGrade: scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null,
        updatedAt: grade.updated_at
      };
    });
    return Response.json({
      student: {
        fullName: student.full_name,
        avatar: student.avatar_webp_data_url,
        section: student.section
      },
      subjects
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("The grade lookup could not be read.");
    return jsonError("Grade lookup is temporarily unavailable. Please try again shortly.", 503);
  }
}
