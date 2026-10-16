import { randomUUID } from "node:crypto";
import { readBodyLimited, requestWithBufferedBody } from "@/lib/server/body-limit";
import { getRequestId } from "@/lib/server/request-id";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, jsonError, verifyStudentSessionTicket } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function errorResponse(message: string, status: number, requestId: string) {
  return Response.json({ error: message, requestId }, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "X-Content-Type-Options": "nosniff", "X-Request-ID": requestId }
  });
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let stage = "validate_request";
  let uploadedPath = "";
  let uploadCompleted = false;
  let databaseUpdated = false;

  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return errorResponse("This photo upload request was not accepted.", 403, requestId);
    }

    stage = "verify_student_session";
    const verified = verifyStudentSessionTicket(readCookie(request, "snhs_student_session"));
    if (!verified) return errorResponse("Your student session has ended. Sign in again before changing your photo.", 401, requestId);

    stage = "rate_limit";
    if (!(await allowRequest(request, "student-profile-photo", 8, 3600, verified.studentId))) {
      return errorResponse("Too many photo updates. Please try again later.", 429, requestId);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength && contentLength > MAX_PHOTO_BYTES + 256 * 1024) {
      return errorResponse("The converted profile photo must be under 2 MB.", 413, requestId);
    }

    stage = "read_photo";
    const boundedBody = await readBodyLimited(request, MAX_PHOTO_BYTES + 256 * 1024);
    if (!boundedBody) return errorResponse("The profile-photo request is too large.", 413, requestId);
    const formRequest = requestWithBufferedBody(request, boundedBody);
    const form = await formRequest.formData();
    const entry = form.get("photo");
    if (!(entry instanceof File) || entry.size === 0) return errorResponse("Choose a profile photo first.", 400, requestId);
    if (entry.type !== "image/webp" || entry.size > MAX_PHOTO_BYTES) {
      return errorResponse("The profile photo must be a WebP image under 2 MB.", 400, requestId);
    }
    const bytes = Buffer.from(await entry.arrayBuffer());
    if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
      return errorResponse("The selected file is not a valid WebP image.", 400, requestId);
    }

    stage = "load_student";
    const admin = getSupabaseAdmin();
    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id, avatar_path")
      .eq("id", verified.studentId)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return errorResponse("This student record is no longer available.", 404, requestId);

    stage = "upload_photo";
    uploadedPath = `students/${verified.studentId}/${randomUUID()}.webp`;
    const { error: uploadError } = await admin.storage.from("profile-photos").upload(uploadedPath, bytes, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) throw uploadError;
    uploadCompleted = true;

    stage = "save_photo_path";
    const { data: updatedStudent, error: updateError } = await admin.from("students")
      .update({ avatar_path: uploadedPath, avatar_webp_data_url: null })
      .eq("id", verified.studentId)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedStudent) throw new Error("Student record was not updated.");
    databaseUpdated = true;

    if (student.avatar_path && student.avatar_path !== uploadedPath) {
      const { error: removeOldError } = await admin.storage.from("profile-photos").remove([student.avatar_path]);
      if (removeOldError) console.warn("[api/students/profile-photo] old photo cleanup failed", { requestId });
    }

    return Response.json({ avatar: "/api/students/photo", message: "Profile photo updated." }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "X-Content-Type-Options": "nosniff", "X-Request-ID": requestId }
    });
  } catch (error) {
    if (uploadCompleted && uploadedPath && !databaseUpdated) {
      try { await getSupabaseAdmin().storage.from("profile-photos").remove([uploadedPath]); } catch { /* Preserve the original failure for diagnostics. */ }
    }
    console.error("[api/students/profile-photo] upload failed", {
      requestId,
      stage,
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") || undefined : undefined
    });
    return errorResponse("Profile photo could not be updated. Please try again shortly.", 503, requestId);
  }
}
