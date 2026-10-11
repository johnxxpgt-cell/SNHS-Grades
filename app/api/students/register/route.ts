import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, digestStudentAccess, digestStudentLrn, encryptStudentBirthday, jsonError } from "@/lib/server/security";
import { MAX_AVATAR_DATA_URL_LENGTH } from "@/lib/constants";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Registration = {
  fullName?: unknown;
  lrn?: unknown;
  birthday?: unknown;
  sectionId?: unknown;
  gender?: unknown;
  avatar?: unknown;
};

export async function POST(request: Request) {
  try {
    if (!(await allowRequest(request, "student-register", 5, 3600))) {
      return jsonError("Too many registration attempts. Please try again later.", 429);
    }
    const rawBody: unknown = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return jsonError("The registration form could not be read.");
    const body = rawBody as Registration;
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
    const lrn = typeof body.lrn === "string" ? body.lrn.replace(/\D/g, "") : "";
    const birthday = typeof body.birthday === "string" ? body.birthday : "";
    const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
    const gender = typeof body.gender === "string" ? body.gender : "Prefer not to say";
    const avatar = typeof body.avatar === "string" ? body.avatar : null;

    if (fullName.length < 3 || fullName.length > 120) return jsonError("Enter your full name (3–120 characters).");
    if (lrn.length < 8 || lrn.length > 20) return jsonError("Enter a valid LRN using 8–20 digits.");
    const parsedBirthday = /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? new Date(`${birthday}T00:00:00Z`) : null;
    if (!parsedBirthday || Number.isNaN(parsedBirthday.getTime()) || parsedBirthday.toISOString().slice(0, 10) !== birthday || birthday > new Date().toISOString().slice(0, 10)) {
      return jsonError("Enter a valid birthday.");
    }
    if (!sectionId) return jsonError("Choose an available class section.");
    if (!["Female", "Male", "Prefer not to say"].includes(gender)) return jsonError("Choose a valid gender option.");
    if (avatar && (!avatar.startsWith("data:image/webp;base64,") || avatar.length > MAX_AVATAR_DATA_URL_LENGTH)) {
      return jsonError("The profile photo must be a small WebP image.");
    }

    const admin = getSupabaseAdmin();
    const { data: section, error: sectionError } = await admin
      .from("teacher_sections")
      .select("id, grade_level, section_name, academic_year")
      .eq("id", sectionId)
      .eq("is_active", true)
      .eq("academic_year", getCurrentAcademicYear())
      .maybeSingle();
    if (sectionError || !section) return jsonError("That class is not accepting registrations. Refresh the list and try again.", 404);

    const { error } = await admin.from("students").insert({
      full_name: fullName,
      lrn_digest: digestStudentLrn(lrn),
      access_digest: digestStudentAccess(fullName, lrn),
      date_of_birth_encrypted: encryptStudentBirthday(birthday),
      gender,
      avatar_webp_data_url: avatar,
      section_id: section.id
    });
    if (error?.code === "23505") return jsonError("This student could not be registered. Please check the details or ask your teacher for help.", 409);
    if (error) throw error;

    return Response.json({
      message: "Registration received. You can now view your grades using your full name and LRN.",
      gradeLevel: section.grade_level,
      sectionName: section.section_name
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("The registration form could not be read.");
    return jsonError("We could not complete registration. Please try again shortly.", 503);
  }
}
