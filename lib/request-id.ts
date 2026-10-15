"use client";

/**
 * Request IDs are non-secret correlation IDs. They are never authentication
 * tokens and must not contain student or teacher information.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function isRequestId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Add or replace request_id on an internal navigation URL. */
export function urlWithRequestId(href: string, requestId = createRequestId()): string {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return href;
  url.searchParams.set("request_id", requestId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Ensure public login/register entry pages have a traceable navigation ID. */
export function ensurePageRequestId(): string {
  const url = new URL(window.location.href);
  const existing = url.searchParams.get("request_id");
  if (isRequestId(existing)) return existing;
  const requestId = createRequestId();
  url.searchParams.set("request_id", requestId);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return requestId;
}

/** Rotate the current page's ID for a new user action, e.g. a teacher login attempt. */
export function rotatePageRequestId(): string {
  const requestId = createRequestId();
  const url = new URL(window.location.href);
  url.searchParams.set("request_id", requestId);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return requestId;
}

/**
 * Attach a unique query parameter and header to each first-party API request.
 * The server's proxy echoes the same ID in the X-Request-ID response header.
 */
export async function fetchWithRequestId(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const original = input.toString();
  const url = new URL(original, window.location.origin);
  const isFirstPartyApi = url.origin === window.location.origin && url.pathname.startsWith("/api/");
  if (!isFirstPartyApi) return fetch(input, init);

  const requestId = createRequestId();
  url.searchParams.set("request_id", requestId);
  const headers = new Headers(init.headers);
  headers.set("X-Request-ID", requestId);
  const target = original.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  return fetch(target, { ...init, headers });
}
