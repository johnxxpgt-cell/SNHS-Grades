import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Build the grade report for a student already verified by the server-side PIN/session. */
export async function getStudentGradeReport(studentId: string) {
  const admin = getSupabaseAdmin();
  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, full_name, avatar_path, avatar_webp_data_url, section_id, section:teacher_sections(teacher_id, grade_level, section_name, academic_year)")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError) throw studentError;
  if (!student) return null;

  const joinedSection = Array.isArray(student.section) ? student.section[0] : student.section;
  if (!joinedSection?.teacher_id) return null;

  const [adviserResult, gradeResult, assessmentResult, scorebookAssessmentResult, catalogueResult, commentResult] = await Promise.all([
    admin.from("teacher_profiles").select("full_name").eq("id", joinedSection.teacher_id).maybeSingle(),
    admin.from("subject_grades").select("id, subject_name, term_1, term_2, term_3, updated_at").eq("student_id", student.id).order("subject_name"),
    admin.from("student_assessments").select("id, category, assessment_name, score, max_score, assessed_on, updated_at").eq("student_id", student.id).order("assessed_on", { ascending: false }).order("updated_at", { ascending: false }),
    admin.from("gradebook_assessments").select("id, subject_name, term_number, category, assessment_name, max_score, assessed_on, created_at").eq("section_id", student.section_id).order("term_number", { ascending: true }).order("assessed_on", { ascending: false }),
    admin.from("gradebook_subjects").select("subject_name").eq("section_id", student.section_id).order("subject_name", { ascending: true }),
    admin.from("student_teacher_comments").select("comment, updated_at").eq("student_id", student.id).maybeSingle()
  ]);
  for (const result of [adviserResult, gradeResult, assessmentResult, scorebookAssessmentResult, catalogueResult, commentResult]) {
    if (result.error) throw result.error;
  }

  const scorebookIds = (scorebookAssessmentResult.data ?? []).map((item) => item.id);
  const { data: scorebookScores, error: scoresError } = scorebookIds.length
    ? await admin.from("gradebook_scores").select("assessment_id, score, updated_at").eq("student_id", student.id).in("assessment_id", scorebookIds).not("score", "is", null)
    : { data: [], error: null };
  if (scoresError) throw scoresError;

  const subjects = (gradeResult.data ?? []).map((grade) => {
    const terms = [grade.term_1, grade.term_2, grade.term_3].map((value) => value === null ? null : Number(value));
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
  const scorebookAssessments = (scorebookAssessmentResult.data ?? []).flatMap((assessment) => {
    const score = scoreByAssessment.get(assessment.id);
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

  let avatar = student.avatar_webp_data_url;
  if (student.avatar_path) {
    const { data, error } = await admin.storage.from("profile-photos").createSignedUrl(student.avatar_path, 3600);
    if (error) throw error;
    avatar = data.signedUrl;
  }
  return {
    student: {
      fullName: student.full_name,
      avatar,
      section: {
        grade_level: joinedSection.grade_level,
        section_name: joinedSection.section_name,
        academic_year: joinedSection.academic_year
      },
      adviserName: adviserResult.data?.full_name?.trim() || "Class adviser not listed"
    },
    subjects,
    availableSubjects: (catalogueResult.data ?? []).map((row) => row.subject_name),
    assessments: [...legacyAssessments, ...scorebookAssessments].sort((left, right) => right.assessedOn.localeCompare(left.assessedOn) || right.updatedAt.localeCompare(left.updatedAt)),
    teacherComment: commentResult.data?.comment ?? null,
    commentUpdatedAt: commentResult.data?.updated_at ?? null
  };
}
