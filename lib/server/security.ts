import "server-only";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";

function secret() {
  const value = process.env.SUPABASE_LRN_HMAC_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("SUPABASE_LRN_HMAC_SECRET must be at least 32 bytes.");
  }
  return value;
}

function encryptionKey() {
  const value = process.env.SUPABASE_DATA_ENCRYPTION_KEY;
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error("SUPABASE_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
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

export function encryptStudentBirthday(birthday: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(birthday, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function digestRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip") || forwarded || "unknown";
  return createHmac("sha256", secret()).update(`request-ip\0${address}`).digest("hex");
}

export async function allowRequest(request: Request, action: string, limit: number, windowSeconds: number) {
  const admin = (await import("@/lib/supabase/admin")).getSupabaseAdmin();
  const { data, error } = await admin.rpc("consume_request_limit", {
    p_ip_digest: digestRequestIp(request),
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) throw new Error("Request limit check failed.");
  return data === true;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
