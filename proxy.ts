import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Correlates first-party API requests with responses and runtime diagnostics.
 * The ID is only for tracing; it does not authenticate or authorize a request.
 */
export function proxy(request: NextRequest) {
  const queryId = request.nextUrl.searchParams.get("request_id");
  const headerId = request.headers.get("x-request-id");
  const requestId = (queryId && UUID_PATTERN.test(queryId) ? queryId : null)
    ?? (headerId && UUID_PATTERN.test(headerId) ? headerId : null)
    ?? randomUUID();

  // Log only a correlation ID, method, and path—never query strings or personal data.
  console.info("[api-request]", {
    requestId,
    method: request.method,
    path: request.nextUrl.pathname
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
