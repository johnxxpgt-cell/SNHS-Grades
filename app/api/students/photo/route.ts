import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, verifyStudentSessionTicket } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const privatePhotoHeaders = {
  "Content-Type": "image/webp",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Vary": "Cookie",
  "Content-Disposition": "inline; filename=profile.webp"
};

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function privateNotFound() {
  return new Response(null, { status: 404, headers: { ...privatePhotoHeaders, "Content-Type": "text/plain" } });
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403, headers: privatePhotoHeaders });
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403, headers: privatePhotoHeaders });
  const session = verifyStudentSessionTicket(readCookie(request, "snhs_student_session"));
  if (!session) return new Response(null, { status: 401, headers: privatePhotoHeaders });

  try {
    if (!(await allowRequest(request, "student-profile-photo-read", 120, 900, session.studentId))) {
      return new Response(null, { status: 429, headers: privatePhotoHeaders });
    }
    const admin = getSupabaseAdmin();
    const { data: student, error } = await admin.from("students")
      .select("avatar_path, avatar_webp_data_url")
      .eq("id", session.studentId)
      .maybeSingle();
    if (error || !student) return privateNotFound();

    if (student.avatar_path) {
      const { data, error: downloadError } = await admin.storage.from("profile-photos").download(student.avatar_path);
      if (downloadError || !data || data.size <= 0 || data.size > MAX_PHOTO_BYTES) return privateNotFound();
      const bytes = await data.arrayBuffer();
      const signature = new Uint8Array(bytes);
      if (signature[0] !== 0x52 || signature[1] !== 0x49 || signature[2] !== 0x46 || signature[3] !== 0x46
        || String.fromCharCode(...signature.slice(8, 12)) !== "WEBP") return privateNotFound();
      return new Response(bytes, { status: 200, headers: { ...privatePhotoHeaders, "Content-Length": String(bytes.byteLength) } });
    }

    const dataUrl = typeof student.avatar_webp_data_url === "string" ? student.avatar_webp_data_url : "";
    const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return privateNotFound();
    const bytes = Buffer.from(match[1], "base64");
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return privateNotFound();
    return new Response(bytes, { status: 200, headers: { ...privatePhotoHeaders, "Content-Length": String(bytes.length) } });
  } catch {
    return new Response(null, { status: 503, headers: privatePhotoHeaders });
  }
}
