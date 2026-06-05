import type { ServerRow } from "./db";

const DEFAULT_HAPP_PANEL_BASE_URL = "https://ger11.memeinternet.site";
const LEGACY_HAPP_PANEL_HOSTS = new Set(["206-251-48-122.nip.io"]);

function normalizeBaseUrl(raw: string, fallback?: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Panel base URL is empty");

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);

  if (LEGACY_HAPP_PANEL_HOSTS.has(url.hostname)) {
    return normalizeBaseUrl(
      fallback || process.env.HAPP_PANEL_BASE_URL || DEFAULT_HAPP_PANEL_BASE_URL,
    );
  }

  return url.toString().replace(/\/+$/, "");
}

export function getServerBaseUrl(server: ServerRow): string {
  const raw = server.domain_server_name;
  if (!raw) throw new Error(`Server ${server.server_id} has no domain_server_name`);
  try {
    return normalizeBaseUrl(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Server ${server.server_id} has invalid domain_server_name: ${message}`);
  }
}
