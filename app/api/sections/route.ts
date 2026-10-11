import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("teacher_sections")
      .select("id, grade_level, section_name, academic_year")
      .eq("is_active", true)
      .eq("academic_year", getCurrentAcademicYear())
      .order("grade_level")
      .order("section_name");
    if (error) throw error;
    return Response.json({ sections: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[sections] Could not load class sections:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Class sections are temporarily unavailable." }, { status: 503 });
  }
}
