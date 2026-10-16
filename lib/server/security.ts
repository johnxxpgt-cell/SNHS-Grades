import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.SUPABASE_LRN_HMAC_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("SUPABASE_LRN_HMAC_SECRET must be at least 32 bytes.");
  }
  return value;
}

function parseEncryptionKey(variableName: string) {
  const value = process.env[variableName];
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error(`${variableName} must be a base64-encoded 32-byte key.`);
  return key;
}

function encryptionKey() {
  return parseEncryptionKey("SUPABASE_DATA_ENCRYPTION_KEY");
}

function contactEncryptionKey() {
  return parseEncryptionKey("SUPABASE_CONTACT_ENCRYPTION_KEY");
}

export function normalizeName(name: string) {
  return name.trim().normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function normalizeLrn(lrn: string) {
  return lrn.replace(/\D/g, "");
}

export function digestStudentLrn(lrn: string) {
  return createHmac("sha256", secret()).update(`lrn\0${normalizeLrn(lrn)}`).digest("hex");
}

export function digestStudentAccess(name: string, lrn: string) {
  return createHmac("sha256", secret())
    .update(`student-access\0${normalizeName(name)}\0${normalizeLrn(lrn)}`)
    .digest("hex");
}

export function digestStudentPin(pin: string, accessDigest: string) {
  return createHmac("sha256", secret())
    .update(`student-pin\0${accessDigest}\0${pin}`)
    .digest("hex");
}


/** Short-lived proof issued only after a successful private student grade lookup. */
export function createStudentFeedbackTicket(studentId: string, lifetimeSeconds = 900) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  const payload = `${studentId}.${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(`student-feedback-ticket\0${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

/** Persistent private student session issued only after a successful LRN/PIN lookup. */
export function createStudentSessionTicket(studentId: string, lifetimeSeconds = 60 * 60 * 24 * 30) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  const payload = `${studentId}.${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(`student-session\0${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

/** Validates the student session cookie; never accepts student IDs from the URL. */
export function verifyStudentSessionTicket(ticket: string) {
  if (ticket.length > 256) return null;
  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  const [studentId, expiryText, signature] = parts;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) return null;
  if (!/^\d{10}$/.test(expiryText) || !/^[A-Za-z0-9_-]{40,50}$/.test(signature)) return null;
  const expiresAt = Number(expiryText);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 60 * 60 * 24 * 30 + 1) return null;
  const payload = `${studentId}.${expiryText}`;
  const expected = createHmac("sha256", secret()).update(`student-session\0${payload}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return { studentId, expiresAt };
}

/** Validates a grade-lookup ticket without retaining the student's LRN or PIN in the browser. */
export function verifyStudentFeedbackTicket(ticket: string) {
  if (ticket.length > 256) return null;
  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  const [studentId, expiryText, signature] = parts;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) return null;
  if (!/^\d{10}$/.test(expiryText) || !/^[A-Za-z0-9_-]{40,50}$/.test(signature)) return null;
  const expiresAt = Number(expiryText);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 901) return null;
  const payload = `${studentId}.${expiryText}`;
  const expected = createHmac("sha256", secret()).update(`student-feedback-ticket\0${payload}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return { studentId, expiresAt };
}

export function encryptStudentBirthday(birthday: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(birthday, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** Encrypts arbitrary short text with authenticated AES-256-GCM field encryption. */
export function encryptSensitiveField(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", contactEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** Decrypts values created by encryptSensitiveField; invalid or tampered data throws. */
export function decryptSensitiveField(envelope: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] = envelope.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || ciphertextEncoded === undefined || extra !== undefined) {
    throw new Error("Unsupported encrypted field format.");
  }
  const iv = Buffer.from(ivEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted field envelope.");
  const decipher = createDecipheriv("aes-256-gcm", contactEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function digestRequestIp(request: Request, subject?: string) {
  if (subject) {
    return createHmac("sha256", secret()).update(`request-subject\0${subject}`).digest("hex");
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip") || forwarded || "unknown";
  return createHmac("sha256", secret()).update(`request-ip\0${address}`).digest("hex");
}

export async function allowRequest(request: Request, action: string, limit: number, windowSeconds: number, subject?: string) {
  const admin = (await import("@/lib/supabase/admin")).getSupabaseAdmin();
  const { data, error } = await admin.rpc("consume_request_limit", {
    p_ip_digest: digestRequestIp(request, subject),
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) throw new Error(`Request limit check failed (${error.code}): ${error.message}`);
  return data === true;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache", "Expires": "0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" } });
}
