import crypto from "crypto";
import type { ServerRow } from "./db";
import { getServerBaseUrl } from "./panel-url";

const VPN_USER = process.env.VPN_API_USER ?? "";
const VPN_PASS = process.env.VPN_API_PASSWORD ?? "";

const authHeader = `Basic ${Buffer.from(`${VPN_USER}:${VPN_PASS}`).toString("base64")}`;
const HAPP_FETCH_TIMEOUT_MS = 15_000;
const HAPP_FETCH_ATTEMPTS = 3;
const RETRYABLE_HAPP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function retryDelayMs(attempt: number): number {
  return Math.min(4_000, 500 * 2 ** (attempt - 1));
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function describeErrorDetails(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Error) {
    const error = value as Error & {
      address?: unknown;
      code?: unknown;
      hostname?: unknown;
      port?: unknown;
      syscall?: unknown;
    };
    const details = [
      error.code ? `code=${String(error.code)}` : null,
      error.syscall ? `syscall=${String(error.syscall)}` : null,
      error.hostname ? `hostname=${String(error.hostname)}` : null,
      error.address ? `address=${String(error.address)}` : null,
      error.port ? `port=${String(error.port)}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return `${value.name}: ${value.message}${details ? ` (${details})` : ""}`;
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function describeFetchFailure(err: unknown): string {
  const main = describeErrorDetails(err) ?? "unknown error";
  const cause = err instanceof Error
    ? (err as Error & { cause?: unknown }).cause
    : undefined;
  const causeText = describeErrorDetails(cause);
  return causeText ? `${main}; cause=${causeText}` : main;
}

async function happFetch(
  url: string,
  init: RequestInit,
  mutationRetriesAreIdempotent = false,
): Promise<Response> {
  const method = init.method ?? "GET";
  // During a rolling deployment an older panel may ignore Idempotency-Key.
  // Retry reads freely, but retry mutations only after the panel advertises
  // support for deduplication.
  const maxAttempts = method === "GET" || mutationRetriesAreIdempotent
    ? HAPP_FETCH_ATTEMPTS
    : 1;
  const headers = new Headers(init.headers);

  // The HAPP panel persists responses by this key. Reusing the key across
  // retries makes POST/DELETE safe even when the first response is lost after
  // the server has already applied the mutation.
  if (method !== "GET" && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", crypto.randomUUID());
  }

  let lastFailure = "unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(HAPP_FETCH_TIMEOUT_MS),
      });

      if (!RETRYABLE_HAPP_STATUSES.has(response.status) || attempt === maxAttempts) {
        return response;
      }

      lastFailure = `HTTP ${response.status}`;
      await response.arrayBuffer().catch(() => undefined);
    } catch (err) {
      lastFailure = describeFetchFailure(err);
      if (attempt === maxAttempts) break;
    }

    const delayMs = retryDelayMs(attempt);
    console.warn(
      `HAPP request ${method} ${url} attempt ${attempt}/${maxAttempts} failed (${lastFailure}); retrying in ${delayMs}ms`,
    );
    await wait(delayMs);
  }

  throw new Error(
    `HAPP request ${method} ${url} failed after ${maxAttempts} attempts: ${lastFailure}`,
  );
}

/**
 * Provision a user on the HAPP panel if they don't exist yet. We first look up
 * the user because the panel's provision endpoint also tops up existing
 * clients. This makes a later lazy backfill safe if a previous POST succeeded
 * but every HTTP response was lost.
 *
 * Returns the full https://… subscription URL to store in users.happ_subscription_url.
 */
export async function provisionHapp(
  panel: ServerRow,
  clientName: string,
  durationCode: string,
): Promise<{ url: string }> {
  const base = getServerBaseUrl(panel);
  const encodedClientName = encodeURIComponent(clientName);
  const userUrl = `${base}/api/users/${encodedClientName}`;
  const existing = await happFetch(userUrl, {
    method: "GET",
    headers: { Authorization: authHeader },
  });

  if (existing.ok) {
    const json = (await existing.json()) as { subscription_url_path?: string };
    const path = json.subscription_url_path;
    if (!path) throw new Error("HAPP user lookup: missing subscription_url_path in response");
    return { url: `${base}${path.startsWith("/") ? "" : "/"}${path}` };
  }
  if (existing.status !== 404) {
    const text = await existing.text().catch(() => "unknown");
    throw new Error(`HAPP user lookup API ${existing.status} ${userUrl}: ${text}`);
  }

  const endpointUrl = `${userUrl}/provision`;
  const resp = await happFetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ duration: durationCode, name: clientName }),
  }, existing.headers.get("X-HAPP-Idempotency") === "1");

  if (!resp.ok) {
    const text = await resp.text().catch(() => "unknown");
    throw new Error(`HAPP provision API ${resp.status} ${endpointUrl}: ${text}`);
  }

  const json = (await resp.json()) as { subscription_url_path?: string };
  const path = json.subscription_url_path;
  if (!path) throw new Error("HAPP provision: missing subscription_url_path in response");

  // subscription_url_path is like "/api/sub/user/<token>"
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  return { url };
}

/**
 * Extend an existing user's clients on the HAPP panel by durationCode.
 * The panel's /api/users/:id/extend endpoint extends all clients of the user.
 */
export async function extendHapp(
  panel: ServerRow,
  clientName: string,
  durationCode: string,
): Promise<void> {
  const base = getServerBaseUrl(panel);
  const userUrl = `${base}/api/users/${encodeURIComponent(clientName)}`;
  const capability = await happFetch(userUrl, {
    method: "GET",
    headers: { Authorization: authHeader },
  });
  const url = `${userUrl}/extend`;
  const resp = await happFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ duration: durationCode }),
  }, capability.headers.get("X-HAPP-Idempotency") === "1");

  if (!resp.ok) {
    const text = await resp.text().catch(() => "unknown");
    throw new Error(`HAPP extend API ${resp.status} ${url}: ${text}`);
  }
}

/**
 * Delete a user and all their VLESS clients from the HAPP panel.
 * Errors are silently swallowed so the caller can proceed with DB cleanup.
 */
export async function deleteHapp(
  panel: ServerRow,
  clientName: string,
): Promise<void> {
  const base = getServerBaseUrl(panel);
  const url = `${base}/api/users/${encodeURIComponent(clientName)}`;
  const capability = await happFetch(url, {
    method: "GET",
    headers: { Authorization: authHeader },
  });
  const resp = await happFetch(url, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  }, capability.headers.get("X-HAPP-Idempotency") === "1");

  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => "unknown");
    throw new Error(`HAPP delete API ${resp.status} ${url}: ${text}`);
  }
}
