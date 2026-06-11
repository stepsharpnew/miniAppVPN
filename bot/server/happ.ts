import type { ServerRow } from "./db";
import { getServerBaseUrl } from "./panel-url";

const VPN_USER = process.env.VPN_API_USER ?? "";
const VPN_PASS = process.env.VPN_API_PASSWORD ?? "";

const authHeader = `Basic ${Buffer.from(`${VPN_USER}:${VPN_PASS}`).toString("base64")}`;
const DEFAULT_HAPP_FETCH_TIMEOUT_MS = 15_000;

function getHappFetchTimeoutMs(): number {
  const timeoutMs = Number(process.env.HAPP_FETCH_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_HAPP_FETCH_TIMEOUT_MS;
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

async function happFetch(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = getHappFetchTimeoutMs();
  const method = init.method ?? "GET";

  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new Error(
      `HAPP request ${method} ${url} failed after ${timeoutMs}ms: ${describeFetchFailure(err)}`,
    );
  }
}

/**
 * Provision a user on the HAPP panel if they don't exist yet, or extend them if
 * they do. The panel's /api/users/:id/provision endpoint is idempotent — it
 * creates a client on every enabled VLESS server and returns the single
 * subscription URL for that user.
 *
 * Returns the full https://… subscription URL to store in users.happ_subscription_url.
 */
export async function provisionHapp(
  panel: ServerRow,
  clientName: string,
  durationCode: string,
): Promise<{ url: string }> {
  const base = getServerBaseUrl(panel);
  const endpointUrl = `${base}/api/users/${encodeURIComponent(clientName)}/provision`;
  const resp = await happFetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ duration: durationCode, name: clientName }),
  });

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
  const url = `${base}/api/users/${encodeURIComponent(clientName)}/extend`;
  const resp = await happFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ duration: durationCode }),
  });

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
  const resp = await happFetch(url, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  });

  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => "unknown");
    throw new Error(`HAPP delete API ${resp.status} ${url}: ${text}`);
  }
}
