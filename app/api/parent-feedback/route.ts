import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowRequest, decryptSensitiveField, jsonError } from "@/lib/server/security";
import { readBodyLimited } from "@/lib/server/body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "X-Content-Type-Options": "nosniff" }
  });
}

async function authorizeTeacher(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length > 8192) return { ok: false as const, status: 401, message: "Sign in through the teacher portal to view parent feedback." };
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, status: 401, message: "Your teacher session is not valid. Sign in again." };
  const { data: sections, error: sectionError } = await admin.from("teacher_sections").select("id").eq("teacher_id", data.user.id).limit(1);
  if (sectionError) throw sectionError;
  if (!sections?.length) return { ok: false as const, status: 403, message: "Parent feedback is available to teachers with a registered class section." };
  return { ok: true as const, admin, user: data.user };
}

function relationValue<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Returns only feedback specifically assigned to the authenticated teacher. */
export async function GET(request: Request) {
  try {
    const auth = await authorizeTeacher(request);
    if (!auth.ok) return privateResponse({ error: auth.message }, auth.status);
    if (!(await allowRequest(request, "parent-feedback-inbox-read", 60, 900, auth.user.id))) {
      return privateResponse({ error: "Too many inbox requests. Please try again shortly." }, 429);
    }
    if (new URL(request.url).searchParams.get("summary") === "1") {
      const { count, error: countError } = await auth.admin
        .from("student_parent_feedback")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", auth.user.id)
        .eq("status", "new");
      if (countError) throw countError;
      return privateResponse({ unreadCount: count ?? 0 });
    }
    const { data, error } = await auth.admin
      .from("student_parent_feedback")
      .select("id, student_id, section_id, guardian_name_encrypted, message_encrypted, subject_name, status, privacy_notice_version, consented_at, created_at, updated_at, student:students(full_name), section:teacher_sections(grade_level, section_name, academic_year)")
      .eq("teacher_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const messages = (data ?? []).map((row) => ({
      id: row.id,
      studentName: relationValue(row.student as { full_name: string } | { full_name: string }[] | null)?.full_name ?? "Student record",
      section: relationValue(row.section as { grade_level: number; section_name: string; academic_year: string } | { grade_level: number; section_name: string; academic_year: string }[] | null),
      guardianName: decryptSensitiveField(row.guardian_name_encrypted),
      message: decryptSensitiveField(row.message_encrypted),
      subjectName: row.subject_name,
      status: row.status,
      privacyNoticeVersion: row.privacy_notice_version,
      consentedAt: row.consented_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    return privateResponse({ messages });
  } catch {
    return privateResponse({ error: "The parent feedback inbox is temporarily unavailable." }, 503);
  }
}

/** Teachers may change the workflow status only for messages assigned to their account. */
export async function PATCH(request: Request) {
  try {
    const auth = await authorizeTeacher(request);
    if (!auth.ok) return privateResponse({ error: auth.message }, auth.status);
    if (!(await allowRequest(request, "parent-feedback-inbox-update", 40, 900, auth.user.id))) {
      return privateResponse({ error: "Too many inbox updates. Please try again shortly." }, 429);
    }
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase("en");
    if (contentType !== "application/json") return privateResponse({ error: "Send a JSON status update." }, 415);
    const boundedBody = await readBodyLimited(request, 2048);
    if (!boundedBody) return privateResponse({ error: "The status update is too large." }, 413);
    const raw = new TextDecoder().decode(boundedBody);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return privateResponse({ error: "The status update could not be read." }, 400); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return privateResponse({ error: "The status update could not be read." }, 400);
    const body = parsed as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return privateResponse({ error: "Choose a valid feedback item." }, 400);
    if (status !== "new" && status !== "in_review" && status !== "resolved") return privateResponse({ error: "Choose a valid feedback status." }, 400);
    const { data, error } = await auth.admin.from("student_parent_feedback")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("teacher_id", auth.user.id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return privateResponse({ error: "That feedback was not found in your assigned sections." }, 404);
    return privateResponse({ id: data.id, status: data.status, message: "Feedback status updated." });
  } catch {
    return privateResponse({ error: "The parent feedback inbox is temporarily unavailable." }, 503);
  }
}
