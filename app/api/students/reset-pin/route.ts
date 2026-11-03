import { timingSafeEqual } from "node:crypto";
import { readBodyLimited } from "@/lib/server/body-limit";
import { getRequestId } from "@/lib/server/request-id";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  allowRequest,
  createStudentPinResetTicket,
  decryptStudentBirthday,
  digestStudentLrn,
  digestStudentPin,
  digestStudentRecoveryAnswer,
  jsonError,
  verifyStudentPinResetTicket
} from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_TICKET_COOKIE = "snhs_student_pin_reset";
const RESET_TICKET_MAX_AGE = 300;

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function withResetCookie(body: unknown, status: number, ticket?: string) {
  const response = Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Vary": "Cookie"
    }
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (ticket) {
    response.headers.append("Set-Cookie", `${RESET_TICKET_COOKIE}=${ticket}; Path=/api/students/reset-pin; HttpOnly; SameSite=Strict; Max-Age=${RESET_TICKET_MAX_AGE}${secure}`);
  }
  return response;
}

function clearResetCookie(response: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${RESET_TICKET_COOKIE}=; Path=/api/students/reset-pin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  return response;
}

async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const bytes = await readBodyLimited(request, 4096);
  if (!bytes) return null;
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function matchesDigest(storedDigest: unknown, suppliedDigest: string) {
  if (typeof storedDigest !== "string") return false;
  const stored = Buffer.from(storedDigest.trim(), "hex");
  const supplied = Buffer.from(suppliedDigest, "hex");
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return jsonError("This PIN reset request was not accepted.", 403);

  try {
    const body = await readJson(request);
    if (!body) return jsonError("Send the PIN reset request as valid JSON.", 400);

    if (body.step === "challenge") {
      if (!(await allowRequest(request, "student-pin-reset-challenge-ip", 10, 900))) {
        return jsonError("Too many reset attempts. Please wait a few minutes and try again.", 429);
      }
      const lrn = typeof body.lrn === "string" ? body.lrn.replace(/\D/g, "") : "";
      const birthday = typeof body.birthday === "string" ? body.birthday : "";
      if (lrn.length < 8 || lrn.length > 20 || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        return jsonError("We could not verify those details.", 400);
      }
      const parsedBirthday = new Date(`${birthday}T00:00:00Z`);
      if (Number.isNaN(parsedBirthday.getTime()) || parsedBirthday.toISOString().slice(0, 10) !== birthday || birthday > new Date().toISOString().slice(0, 10)) {
        return jsonError("We could not verify those details.", 400);
      }
      const lrnDigest = digestStudentLrn(lrn);
      if (!(await allowRequest(request, "student-pin-reset-challenge-student", 5, 900, lrnDigest))) {
        return jsonError("Too many reset attempts for this student record. Please wait 15 minutes and try again.", 429);
      }
      const admin = getSupabaseAdmin();
      const { data: student, error } = await admin.from("students")
        .select("id, date_of_birth_encrypted, recovery_question")
        .eq("lrn_digest", lrnDigest)
        .maybeSingle();
      if (error) throw error;
      if (!student) return clearResetCookie(jsonError("We could not verify those details.", 400));

      const savedBirthday = decryptStudentBirthday(student.date_of_birth_encrypted);
      const suppliedBirthday = Buffer.from(birthday, "utf8");
      const savedBirthdayBytes = Buffer.from(savedBirthday, "utf8");
      if (savedBirthdayBytes.length !== suppliedBirthday.length || !timingSafeEqual(savedBirthdayBytes, suppliedBirthday)) {
        return clearResetCookie(jsonError("We could not verify those details.", 400));
      }

      const question = typeof student.recovery_question === "string" ? student.recovery_question.trim() : "";
      const response = withResetCookie({ securityQuestion: question || null }, 200, createStudentPinResetTicket(student.id));
      return response;
    }

    if (body.step !== "reset") return jsonError("Choose a valid PIN reset step.", 400);
    if (!(await allowRequest(request, "student-pin-reset-submit-ip", 10, 900))) {
      return jsonError("Too many reset attempts. Please wait a few minutes and try again.", 429);
    }
    const ticket = verifyStudentPinResetTicket(readCookie(request, RESET_TICKET_COOKIE));
    if (!ticket) return jsonError("Your reset check has expired. Enter your LRN and birthday again.", 401);
    if (!(await allowRequest(request, "student-pin-reset-submit-student", 5, 900, ticket.studentId))) {
      return jsonError("Too many reset attempts for this student record. Please wait 15 minutes and try again.", 429);
    }

    const newPin = typeof body.newPin === "string" ? body.newPin : "";
    const recoveryAnswer = typeof body.recoveryAnswer === "string" ? body.recoveryAnswer.trim().replace(/\s+/g, " ") : "";
    if (!/^\d{4}$/.test(newPin)) return jsonError("Choose a new 4-digit PIN.", 400);

    const admin = getSupabaseAdmin();
    const { data: student, error } = await admin.from("students")
      .select("id, access_digest, recovery_question, recovery_answer_digest")
      .eq("id", ticket.studentId)
      .maybeSingle();
    if (error) throw error;
    if (!student) return clearResetCookie(jsonError("This student record is no longer available.", 404));

    if (student.recovery_question) {
      if (recoveryAnswer.length < 2 || recoveryAnswer.length > 120
        || !matchesDigest(student.recovery_answer_digest, digestStudentRecoveryAnswer(recoveryAnswer, student.id))) {
        return jsonError("That recovery answer does not match. Check your answer and try again.", 400);
      }
    }

    const { error: updateError } = await admin.from("students")
      .update({ pin_digest: digestStudentPin(newPin, String(student.access_digest).trim()) })
      .eq("id", student.id);
    if (updateError) throw updateError;
    return clearResetCookie(withResetCookie({ message: "Your PIN has been reset. Sign in with your LRN and new 4-digit PIN." }, 200));
  } catch (error) {
    console.error("[api/students/reset-pin] request failed", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") || undefined : undefined
    });
    return jsonError("PIN reset is temporarily unavailable. Please try again shortly.", 503);
  }
}
