import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

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
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
