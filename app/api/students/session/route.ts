import { createStudentSessionTicket, verifyStudentSessionTicket, jsonError } from "@/lib/server/security";
import { getStudentGradeReport } from "@/lib/server/student-grade-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_AGE = 60 * 60 * 24 * 30;

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function privateResponse(body: unknown, status = 200, renewedTicket?: string) {
  const response = Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" } });
  if (renewedTicket) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append("Set-Cookie", `snhs_student_session=${renewedTicket}; Path=/api/students; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure}`);
  }
  return response;
}

export async function GET(request: Request) {
  try {
    const verified = verifyStudentSessionTicket(readCookie(request, "snhs_student_session"));
    if (!verified) return jsonError("Your student session has ended. Please sign in again.", 401);
    const renewedTicket = createStudentSessionTicket(verified.studentId);
    if (new URL(request.url).searchParams.get("check") === "1") return privateResponse({ authenticated: true }, 200, renewedTicket);
    const report = await getStudentGradeReport(verified.studentId);
    if (!report) return privateResponse({ error: "This student record is no longer available. Please contact your class adviser." }, 404);
    return privateResponse(report, 200, renewedTicket);
  } catch (error) {
    console.error("[api/students/session] grade report failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return privateResponse({ error: "Your grade report is temporarily unavailable. Please try again." }, 503);
  }
}
