import { getRequestId } from "@/lib/server/request-id";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, encryptSensitiveField, jsonError, verifyStudentFeedbackTicket, verifyStudentSessionTicket } from "@/lib/server/security";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";
import { readBodyLimited } from "@/lib/server/body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateResponse(body: unknown, status = 200, clearTicket = false, requestId?: string) {
  const response = Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      ...(requestId ? { "X-Request-ID": requestId } : {})
    }
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
  const requestId = getRequestId(request);
  let stage = "request_validation";
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Feedback must be submitted from the school website.", requestId }, { status: 403, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "X-Request-ID": requestId } });
    if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Cross-site feedback requests are not accepted.", requestId }, { status: 403, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "X-Request-ID": requestId } });

    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase("en");
    if (contentType !== "application/json") return jsonError("Send feedback as JSON.", 415);
    const boundedBody = await readBodyLimited(request, 8000);
    if (!boundedBody) return jsonError("Your feedback is too long. Please shorten it.", 413);
    const raw = new TextDecoder().decode(boundedBody);
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

    stage = "verify_grade_lookup_ticket";
    const feedbackTicket = verifyStudentFeedbackTicket(readCookie(request, "snhs_feedback_ticket"));
    const studentSession = verifyStudentSessionTicket(readCookie(request, "snhs_student_session"));
    const studentId = feedbackTicket?.studentId ?? studentSession?.studentId;
    if (!studentId) return jsonError("Your student session has ended. Sign in again before sending feedback.", 401);
    stage = "global_rate_limit";
    if (!(await allowRequest(request, "student-parent-feedback", 4, 3600))) {
      return jsonError("Too many feedback messages have been sent. Please try again later.", 429);
    }
    stage = "student_rate_limit";
    if (!(await allowRequest(request, "student-parent-feedback-student", 3, 3600, studentId))) {
      return jsonError("This student record has reached its hourly feedback limit. Please try again later.", 429);
    }

    stage = "supabase_admin_client";
    const admin = getSupabaseAdmin();
    stage = "load_student_and_section";
    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id, section_id, section:teacher_sections(id, teacher_id)")
      .eq("id", studentId)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return jsonError("The verified student record could not be found. Look up the grade report again.", 401);

    const joinedSection = Array.isArray(student.section) ? student.section[0] : student.section;
    if (!joinedSection?.id || !joinedSection?.teacher_id) return jsonError("This student has no assigned class adviser. Please contact the school office.", 409);

    let verifiedSubject: string | null = null;
    if (subjectName) {
      stage = "verify_subject";
      const { data: subjectRows, error: subjectError } = await admin
        .from("gradebook_subjects")
        .select("subject_name")
        .eq("section_id", joinedSection.id);
      if (subjectError) throw subjectError;
      verifiedSubject = (subjectRows ?? []).find((row) => row.subject_name.toLocaleLowerCase() === subjectName.toLocaleLowerCase())?.subject_name ?? null;
      if (!verifiedSubject) return jsonError("Choose a subject from this student's saved class subjects, or select general feedback.", 400);
    }

    stage = "encrypt_feedback";
    const guardianNameEncrypted = encryptSensitiveField(guardianName);
    const messageEncrypted = encryptSensitiveField(message);

    stage = "insert_feedback";
    const { error: insertError } = await admin.from("student_parent_feedback").insert({
      student_id: student.id,
      section_id: joinedSection.id,
      teacher_id: joinedSection.teacher_id,
      guardian_name_encrypted: guardianNameEncrypted,
      message_encrypted: messageEncrypted,
      subject_name: verifiedSubject,
      status: "new",
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      consented_at: new Date().toISOString()
    });
    if (insertError) throw insertError;

    return privateResponse({ message: "Your feedback has been delivered to the class adviser for this section.", requestId }, 201, true, requestId);
  } catch (error) {
    // Keep technical details in server logs only; never return secrets, SQL messages, or PII to the browser.
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    console.error("[api/students/feedback] submission failed", {
      requestId,
      stage,
      name: error instanceof Error ? error.name : "UnknownError",
      code: code || undefined
    });
    return privateResponse({
      error: "We could not send your feedback right now. Please try again shortly.",
      requestId
    }, 503, false, requestId);
  }
}
