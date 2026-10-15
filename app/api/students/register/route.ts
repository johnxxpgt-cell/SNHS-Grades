import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, digestStudentAccess, digestStudentLrn, digestStudentPin, encryptStudentBirthday, jsonError } from "@/lib/server/security";
import { getCurrentAcademicYear } from "@/lib/academic-year";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!(await allowRequest(request, "student-register", 5, 3600))) {
      return jsonError("Too many registration attempts. Please try again later.", 429);
    }
    const form = await request.formData();
    const fullName = String(form.get("fullName") ?? "").trim().replace(/\s+/g, " ");
    const lrn = String(form.get("lrn") ?? "").replace(/\D/g, "");
    const pin = String(form.get("pin") ?? "");
    const birthday = String(form.get("birthday") ?? "");
    const sectionId = String(form.get("sectionId") ?? "");
    const gender = String(form.get("gender") ?? "Prefer not to say");
    const privacyConsent = String(form.get("privacyConsent") ?? "") === "accepted";
    const privacyNoticeVersion = String(form.get("privacyNoticeVersion") ?? "");
    const photoEntry = form.get("photo");
    const photo = photoEntry instanceof File ? photoEntry : null;

    if (!privacyConsent || privacyNoticeVersion !== PRIVACY_NOTICE_VERSION) {
      return jsonError("Please review the Privacy Policy and confirm consent before registering.", 400);
    }
    if (fullName.length < 3 || fullName.length > 120) return jsonError("Enter your full name (3–120 characters).");
    if (lrn.length < 8 || lrn.length > 20) return jsonError("Enter a valid LRN using 8–20 digits.");
    if (!/^\d{4}$/.test(pin)) return jsonError("Choose a 4-digit PIN to protect your grade report.");
    const parsedBirthday = /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? new Date(`${birthday}T00:00:00Z`) : null;
    if (!parsedBirthday || Number.isNaN(parsedBirthday.getTime()) || parsedBirthday.toISOString().slice(0, 10) !== birthday || birthday > new Date().toISOString().slice(0, 10)) {
      return jsonError("Enter a valid birthday.");
    }
    if (!sectionId) return jsonError("Choose an available class section.");
    if (!["Female", "Male", "Prefer not to say"].includes(gender)) return jsonError("Choose a valid gender option.");
    if (photoEntry && !(photoEntry instanceof File)) return jsonError("Choose a valid profile photo.");
    if (photo && photo.size === 0) return jsonError("Choose a photo with image data.");
    if (photo && (photo.type !== "image/webp" || photo.size > 2 * 1024 * 1024)) {
      return jsonError("The profile photo must be a WebP image under 2 MB.");
    }
    const photoBytes = photo ? Buffer.from(await photo.arrayBuffer()) : null;
    if (photoBytes && (photoBytes.toString("ascii", 0, 4) !== "RIFF" || photoBytes.toString("ascii", 8, 12) !== "WEBP")) {
      return jsonError("The profile photo must be a valid WebP image.");
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

    const accessDigest = digestStudentAccess(fullName, lrn);
    const studentId = randomUUID();
    const photoPath = photo ? `students/${studentId}/${randomUUID()}.webp` : null;
    if (photo && photoPath) {
      const { error: uploadError } = await admin.storage.from("profile-photos").upload(photoPath, photoBytes!, {
        contentType: "image/webp",
        cacheControl: "3600",
        upsert: false
      });
      if (uploadError) throw uploadError;
    }
    const { error } = await admin.from("students").insert({
      id: studentId,
      full_name: fullName,
      lrn_digest: digestStudentLrn(lrn),
      access_digest: accessDigest,
      pin_digest: digestStudentPin(pin, accessDigest),
      date_of_birth_encrypted: encryptStudentBirthday(birthday),
      gender,
      avatar_path: photoPath,
      section_id: section.id,
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      privacy_consented_at: new Date().toISOString()
    });
    if (error) {
      if (photoPath) await admin.storage.from("profile-photos").remove([photoPath]);
      if (error.code === "23505") return jsonError("This student could not be registered. Please check the details or ask your teacher for help.", 409);
      throw error;
    }

    return Response.json({
      message: "Registration received. Use your full name, LRN, and 4-digit PIN to view your grades.",
      gradeLevel: section.grade_level,
      sectionName: section.section_name
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[students/register] Registration request failed:", error instanceof Error ? error.message : "Unknown error");
    return jsonError("We could not complete registration. Please try again shortly.", 503);
  }
}
