import { randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Use a validated correlation ID set by proxy.ts; never treat it as an auth credential. */
export function getRequestId(request: Request): string {
  const headerId = request.headers.get("x-request-id");
  if (headerId && UUID_PATTERN.test(headerId)) return headerId.toLowerCase();
  const queryId = new URL(request.url).searchParams.get("request_id");
  if (queryId && UUID_PATTERN.test(queryId)) return queryId.toLowerCase();
  return randomUUID();
}
