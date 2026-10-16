import { jsonError } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return jsonError("Logout request was not accepted.", 403);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const response = Response.json({ success: true }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "X-Content-Type-Options": "nosniff" } });
  response.headers.append("Set-Cookie", `snhs_student_session=; Path=/api/students; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  response.headers.append("Set-Cookie", `snhs_feedback_ticket=; Path=/api/students/feedback; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  return response;
}
