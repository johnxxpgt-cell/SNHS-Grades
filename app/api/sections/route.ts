import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("teacher_sections")
      .select("id, teacher_id, grade_level, section_name, academic_year")
      .eq("is_active", true)
      .eq("academic_year", getCurrentAcademicYear())
      .order("grade_level")
      .order("section_name");
    if (error) throw error;
    const rows = data ?? [];
    const teacherIds = [...new Set(rows.map((row) => row.teacher_id).filter(Boolean))];
    const { data: teachers, error: teacherError } = teacherIds.length
      ? await admin.from("teacher_profiles").select("id, full_name").in("id", teacherIds)
      : { data: [], error: null };
    if (teacherError) throw teacherError;
    const names = new Map((teachers ?? []).map((teacher) => [teacher.id, teacher.full_name]));
    const sections = rows.map((row) => ({
      id: row.id,
      grade_level: row.grade_level,
      section_name: row.section_name,
      academic_year: row.academic_year,
      adviserName: names.get(row.teacher_id)?.trim() || "Class adviser not listed"
    }));
    return Response.json({ sections }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[sections] Could not load class sections:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Class sections are temporarily unavailable." }, { status: 503 });
  }
}
