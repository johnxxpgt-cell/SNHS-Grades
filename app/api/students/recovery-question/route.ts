import { readBodyLimited } from "@/lib/server/body-limit";
import { getRequestId } from "@/lib/server/request-id";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, digestStudentRecoveryAnswer, jsonError, verifyStudentSessionTicket } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return jsonError("This recovery setup request was not accepted.", 403);

  try {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return jsonError("Send the recovery setup as JSON.", 415);
    }
    const verified = verifyStudentSessionTicket(readCookie(request, "snhs_student_session"));
    if (!verified) return jsonError("Your student session has ended. Sign in again before setting a recovery question.", 401);
    if (!(await allowRequest(request, "student-recovery-question-ip", 8, 3600))) {
      return jsonError("Too many recovery setup attempts. Please try again later.", 429);
    }
    if (!(await allowRequest(request, "student-recovery-question-student", 5, 3600, verified.studentId))) {
      return jsonError("Too many recovery setup attempts for this student record. Please try again later.", 429);
    }

    const bytes = await readBodyLimited(request, 4096);
    if (!bytes) return jsonError("The recovery setup request is too large.", 413);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return jsonError("The recovery setup request could not be read."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("The recovery setup request could not be read.");
    const values = body as { question?: unknown; answer?: unknown };
    const question = typeof values.question === "string" ? values.question.trim().replace(/\s+/g, " ") : "";
    const answer = typeof values.answer === "string" ? values.answer.trim().replace(/\s+/g, " ") : "";
    if (question.length < 8 || question.length > 160) return jsonError("Write a recovery question between 8 and 160 characters.");
    if (answer.length < 2 || answer.length > 120) return jsonError("Enter a recovery answer between 2 and 120 characters.");

    const admin = getSupabaseAdmin();
    const { data: updated, error } = await admin.from("students")
      .update({ recovery_question: question, recovery_answer_digest: digestStudentRecoveryAnswer(answer, verified.studentId) })
      .eq("id", verified.studentId)
      .is("recovery_question", null)
      .is("recovery_answer_digest", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      const { data: student, error: studentError } = await admin.from("students")
        .select("recovery_question, recovery_answer_digest")
        .eq("id", verified.studentId)
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student) return jsonError("This student record is no longer available.", 404);
      if (student.recovery_question && student.recovery_answer_digest) {
        return Response.json({ configured: true, message: "Your personal recovery question is already set." }, { headers: { "Cache-Control": "no-store, private", "Vary": "Cookie" } });
      }
      return jsonError("The recovery question could not be saved. Please try again.", 409);
    }

    return Response.json({ configured: true, message: "Your personal recovery question is saved. Your grade report is ready." }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "Vary": "Cookie" }
    });
  } catch (error) {
    console.error("[api/students/recovery-question] request failed", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") || undefined : undefined
    });
    return jsonError("The recovery question could not be saved. Please try again shortly.", 503);
  }
}
