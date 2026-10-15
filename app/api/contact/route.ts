import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  allowRequest,
  decryptSensitiveField,
  encryptSensitiveField,
  jsonError
} from "@/lib/server/security";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength)
    : "";
}

function privateResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function authorizeInbox(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { ok: false as const, status: 401, message: "Authentication is required." };

  const allowedEmails = (process.env.SUPABASE_CONTACT_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase("en"))
    .filter(Boolean);
  if (!allowedEmails.length) {
    return { ok: false as const, status: 503, message: "The contact inbox is not configured." };
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  const email = data.user?.email?.trim().toLocaleLowerCase("en") ?? "";
  if (error || !email) return { ok: false as const, status: 401, message: "The session is not valid." };
  if (!allowedEmails.includes(email)) {
    return { ok: false as const, status: 403, message: "This account is not authorized to read contact messages." };
  }
  return { ok: true as const, admin, email };
}

/** Public, rate-limited contact submission. Personal fields are encrypted before database insert. */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase("en");
    if (contentType !== "application/json") return jsonError("Send the contact form as JSON.", 415);

    const raw = await request.text();
    if (raw.length > 12_000) return jsonError("The message is too large. Please shorten it and try again.", 413);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return jsonError("The contact form could not be read.", 400);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return jsonError("The contact form could not be read.", 400);
    const body = value as Record<string, unknown>;

    // Quietly accept bot submissions without saving them or revealing the honeypot result.
    if (cleanText(body.website, 200)) return privateResponse({ message: "Thank you. Your message has been received." }, 202);

    if (body.privacyConsent !== true || body.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION) {
      return jsonError("Please read the Privacy Policy and consent to processing before sending your message.", 400);
    }
    const name = cleanText(body.name, 80);
    const email = cleanText(body.email, 254).toLocaleLowerCase("en");
    const subject = cleanText(body.subject, 120);
    const message = cleanText(body.message, 4000);

    if (name.length < 2) return jsonError("Enter your name (at least 2 characters).");
    if (email.length > 254 || !EMAIL_RE.test(email)) return jsonError("Enter a valid email address.");
    if (subject.length < 3) return jsonError("Enter a subject (at least 3 characters).");
    if (message.length < 10) return jsonError("Write a message of at least 10 characters.");

    if (!(await allowRequest(request, "contact-submit", 4, 3600))) {
      return jsonError("Too many messages have been sent from this connection. Please try again later.", 429);
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("contact_submissions").insert({
      name_encrypted: encryptSensitiveField(name),
      email_encrypted: encryptSensitiveField(email),
      subject_encrypted: encryptSensitiveField(subject),
      message_encrypted: encryptSensitiveField(message),
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      consented_at: new Date().toISOString()
    });
    if (error) throw error;

    return privateResponse({ message: "Thank you. Your message has been received." }, 201);
  } catch {
    // Do not log form payloads or return database/error details to unauthenticated visitors.
    return jsonError("We could not send your message right now. Please try again later.", 503);
  }
}

/** Authenticated, email-allowlisted inbox API for the school-designated contact administrator. */
export async function GET(request: Request) {
  try {
    const auth = await authorizeInbox(request);
    if (!auth.ok) return privateResponse({ error: auth.message }, auth.status);
    if (!(await allowRequest(request, "contact-inbox-read", 60, 900, auth.email))) {
      return privateResponse({ error: "Too many inbox requests. Please try again later." }, 429);
    }

    const { data, error } = await auth.admin
      .from("contact_submissions")
      .select("id, name_encrypted, email_encrypted, subject_encrypted, message_encrypted, privacy_notice_version, consented_at, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const messages = (data ?? []).map((row) => ({
      id: row.id,
      name: decryptSensitiveField(row.name_encrypted),
      email: decryptSensitiveField(row.email_encrypted),
      subject: decryptSensitiveField(row.subject_encrypted),
      message: decryptSensitiveField(row.message_encrypted),
      privacyNoticeVersion: row.privacy_notice_version,
      consentedAt: row.consented_at,
      status: row.status,
      createdAt: row.created_at
    }));
    return privateResponse({ messages });
  } catch {
    return privateResponse({ error: "The contact inbox is temporarily unavailable." }, 503);
  }
}


/** Allows only allowlisted inbox administrators to update an inquiry's workflow status. */
export async function PATCH(request: Request) {
  try {
    const auth = await authorizeInbox(request);
    if (!auth.ok) return privateResponse({ error: auth.message }, auth.status);
    if (!(await allowRequest(request, "contact-inbox-update", 30, 900, auth.email))) {
      return privateResponse({ error: "Too many inbox updates. Please try again later." }, 429);
    }

    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase("en");
    if (contentType !== "application/json") return privateResponse({ error: "Send a JSON status update." }, 415);
    const raw = await request.text();
    if (raw.length > 2048) return privateResponse({ error: "The status update is too large." }, 413);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return privateResponse({ error: "The status update could not be read." }, 400); }
    if (!value || typeof value !== "object" || Array.isArray(value)) return privateResponse({ error: "The status update could not be read." }, 400);
    const body = value as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return privateResponse({ error: "Choose a valid inquiry." }, 400);
    }
    if (status !== "new" && status !== "in_review" && status !== "closed") {
      return privateResponse({ error: "Choose a valid inquiry status." }, 400);
    }
    const { data, error } = await auth.admin.from("contact_submissions")
      .update({ status })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return privateResponse({ error: "The inquiry was not found." }, 404);
    return privateResponse({ message: "Inquiry status updated.", id: data.id, status: data.status });
  } catch {
    return privateResponse({ error: "The contact inbox is temporarily unavailable." }, 503);
  }
}


/** Permanently deletes one inquiry after a server-side allowlist check. */
export async function DELETE(request: Request) {
  try {
    const auth = await authorizeInbox(request);
    if (!auth.ok) return privateResponse({ error: auth.message }, auth.status);
    if (!(await allowRequest(request, "contact-inbox-delete", 15, 900, auth.email))) {
      return privateResponse({ error: "Too many inbox deletions. Please try again later." }, 429);
    }

    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase("en");
    if (contentType !== "application/json") return privateResponse({ error: "Send a JSON deletion request." }, 415);
    const raw = await request.text();
    if (raw.length > 2048) return privateResponse({ error: "The deletion request is too large." }, 413);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return privateResponse({ error: "The deletion request could not be read." }, 400); }
    if (!value || typeof value !== "object" || Array.isArray(value)) return privateResponse({ error: "The deletion request could not be read." }, 400);
    const id = typeof (value as Record<string, unknown>).id === "string" ? (value as Record<string, unknown>).id as string : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return privateResponse({ error: "Choose a valid inquiry." }, 400);
    }

    const { data, error } = await auth.admin.from("contact_submissions")
      .delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return privateResponse({ error: "The inquiry was not found." }, 404);
    return privateResponse({ message: "Inquiry deleted permanently.", id: data.id });
  } catch {
    return privateResponse({ error: "The contact inbox is temporarily unavailable." }, 503);
  }
}
