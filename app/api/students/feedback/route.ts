import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, encryptSensitiveField, jsonError, verifyStudentFeedbackTicket } from "@/lib/server/security";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateResponse(body: unknown, status = 200, clearTicket = false) {
  const response = Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" }
  });
  if (clearTicket) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append("Set-Cookie", `snhs_feedback_ticket=; Path=/api/students/feedback; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  }
  return response;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength)
    : "";
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

/** Parent/guardian submission. The cookie is signed by the server after an LRN/PIN-protected lookup. */
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return jsonError("Feedback must be submitted from the school website.", 403);
    if (request.headers.get("sec-fetch-site") === "cross-site") return jsonError("Cross-site feedback requests are not accepted.", 403);

    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase("en");
    if (contentType !== "application/json") return jsonError("Send feedback as JSON.", 415);
    const raw = await request.text();
    if (raw.length > 8000) return jsonError("Your feedback is too long. Please shorten it.", 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return jsonError("The feedback form could not be read.", 400); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError("The feedback form could not be read.", 400);
    const body = parsed as Record<string, unknown>;
    if (body.privacyConsent !== true || body.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION) {
      return jsonError("Confirm the privacy notice before sending feedback.", 400);
    }

    const guardianName = cleanText(body.guardianName, 100);
    const message = cleanText(body.message, 2000);
    const subjectName = cleanText(body.subjectName, 80);
    if (guardianName.length < 2) return jsonError("Enter the parent or guardian's name (at least 2 characters).", 400);
    if (message.length < 10) return jsonError("Write at least 10 characters so the teacher understands your feedback.", 400);

    const ticket = verifyStudentFeedbackTicket(readCookie(request, "snhs_feedback_ticket"));
    if (!ticket) return jsonError("Your grade-view verification has expired. Look up the grade report again before sending feedback.", 401);
    if (!(await allowRequest(request, "student-parent-feedback", 4, 3600))) {
      return jsonError("Too many feedback messages have been sent. Please try again later.", 429);
    }
    if (!(await allowRequest(request, "student-parent-feedback-student", 3, 3600, ticket.studentId))) {
      return jsonError("This student record has reached its hourly feedback limit. Please try again later.", 429);
    }

    const admin = getSupabaseAdmin();
    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id, section_id, section:teacher_sections(id, teacher_id)")
      .eq("id", ticket.studentId)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return jsonError("The verified student record could not be found. Look up the grade report again.", 401);

    const joinedSection = Array.isArray(student.section) ? student.section[0] : student.section;
    if (!joinedSection?.id || !joinedSection?.teacher_id) return jsonError("This student has no assigned class adviser. Please contact the school office.", 409);

    let verifiedSubject: string | null = null;
    if (subjectName) {
      const { data: subjectRows, error: subjectError } = await admin
        .from("gradebook_subjects")
        .select("subject_name")
        .eq("section_id", joinedSection.id);
      if (subjectError) throw subjectError;
      verifiedSubject = (subjectRows ?? []).find((row) => row.subject_name.toLocaleLowerCase() === subjectName.toLocaleLowerCase())?.subject_name ?? null;
      if (!verifiedSubject) return jsonError("Choose a subject from this student's saved class subjects, or select general feedback.", 400);
    }

    const { error: insertError } = await admin.from("student_parent_feedback").insert({
      student_id: student.id,
      section_id: joinedSection.id,
      teacher_id: joinedSection.teacher_id,
      guardian_name_encrypted: encryptSensitiveField(guardianName),
      message_encrypted: encryptSensitiveField(message),
      subject_name: verifiedSubject,
      status: "new",
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      consented_at: new Date().toISOString()
    });
    if (insertError) throw insertError;

    return privateResponse({ message: "Your feedback has been delivered to the class adviser for this section." }, 201, true);
  } catch {
    return jsonError("We could not send your feedback right now. Please try again shortly.", 503);
  }
}
