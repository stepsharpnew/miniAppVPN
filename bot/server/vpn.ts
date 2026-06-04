const VPN_USER = process.env.VPN_API_USER ?? "";
const VPN_PASS = process.env.VPN_API_PASSWORD ?? "";

const authHeader = `Basic ${Buffer.from(`${VPN_USER}:${VPN_PASS}`).toString("base64")}`;

interface Client {
  id: string;
  name: string;
  client_private_key: string;
  client_ip: string;
  preshared_key: string;
  obfuscation_params: Record<string, number>;
}

interface Server {
  id: string;
  name: string;
  server_public_key: string;
  public_ip: string;
  port: number;
  dns: string[];
  mtu: number;
  clients: Client[];
}

function buildConfig(server: Server, client: Client): string {
  const ob = client.obfuscation_params;
  return [
    "[Interface]",
    `PrivateKey = ${client.client_private_key}`,
    `Address = ${client.client_ip}/32`,
    `DNS = ${server.dns.join(", ")}`,
    `MTU = ${server.mtu}`,
    `Jc = ${ob.Jc}`,
    `Jmin = ${ob.Jmin}`,
    `Jmax = ${ob.Jmax}`,
    `S1 = ${ob.S1}`,
    `S2 = ${ob.S2}`,
    `H1 = ${ob.H1}`,
    `H2 = ${ob.H2}`,
    `H3 = ${ob.H3}`,
    `H4 = ${ob.H4}`,
    "",
    "[Peer]",
    `PublicKey = ${server.server_public_key}`,
    `PresharedKey = ${client.preshared_key}`,
    `Endpoint = ${server.public_ip}:${server.port}`,
    "AllowedIPs = 0.0.0.0/0",
    "PersistentKeepalive = 25",
    "",
  ].join("\n");
}

async function findExistingClient(
  name: string,
  baseUrl: string,
): Promise<{ id: string; config: string; serverId: string } | null> {
  const resp = await fetch(`${baseUrl}/api/servers`, {
    headers: { Authorization: authHeader },
  });
  if (!resp.ok) return null;

  const servers: Server[] = await resp.json();
  for (const server of servers) {
    const client = server.clients.find((c) => c.name === name);
    if (client) {
      return { id: client.id, config: buildConfig(server, client), serverId: server.id };
    }
  }
  return null;
}

function isUnsupportedDurationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("Unsupported client duration");
}

/** Минимальный legacy-код (1m/3m/6m/12m) для старого app.py, покрывающий остаток подписки. */
function legacyDurationForRemainingDays(remainingDays: number): string {
  if (remainingDays <= 31) return "1m";
  if (remainingDays <= 93) return "3m";
  if (remainingDays <= 186) return "6m";
  return "12m";
}

/** Варианты duration для Amnezia API: сначала точные (новый app.py), затем legacy. */
export function vpnDurationCandidates(expiredAt: Date): string[] {
  const remainingMs = expiredAt.getTime() - Date.now();
  const remainingDays = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  const isoUtc = expiredAt.toISOString().slice(0, 19).replace("T", " ");
  const absTs = `abs:${(expiredAt.getTime() / 1000).toFixed(3)}`;
  const days = `${remainingDays}d`;
  const legacy = legacyDurationForRemainingDays(remainingDays);
  return [isoUtc, absTs, days, legacy];
}

/**
 * Provisions a VPN client: returns an existing config or creates a new one.
 * `serverId` — the WireGuard server to provision on (from the `servers` table).
 * Throws on network / API errors.
 */
export async function provisionVpnClient(
  clientName: string,
  durationCode: string,
  serverId: string,
  baseUrl: string,
  options?: { allowExisting?: boolean },
): Promise<string> {
  if (options?.allowExisting !== false) {
    const existing = await findExistingClient(clientName, baseUrl);
    if (existing) return existing.config;
  }

  const resp = await fetch(`${baseUrl}/api/servers/${serverId}/clients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ name: clientName, duration: durationCode }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "unknown");
    throw new Error(`VPN API ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  return json.config as string;
}

/**
 * Создаёт клиента с истечением не позже `expiredAt`.
 * Перебирает форматы duration, пока панель Amnezia не примет один из них.
 */
export async function provisionVpnClientUntilExpiry(
  clientName: string,
  expiredAt: Date,
  serverId: string,
  baseUrl: string,
): Promise<string> {
  const candidates = vpnDurationCandidates(expiredAt);
  let lastErr: Error | null = null;

  for (const durationCode of candidates) {
    try {
      return await provisionVpnClient(clientName, durationCode, serverId, baseUrl, {
        allowExisting: false,
      });
    } catch (err) {
      if (isUnsupportedDurationError(err)) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error("VPN provision failed: no compatible duration format");
}

/**
 * Delete a VPN client by name from the server.
 * Returns the WireGuard server ID the client was on, or null if not found.
 */
export async function deleteVpnClient(
  clientName: string,
  baseUrl: string,
): Promise<string | null> {
  const existing = await findExistingClient(clientName, baseUrl);
  if (!existing) return null;

  const resp = await fetch(
    `${baseUrl}/api/servers/${existing.serverId}/clients/${existing.id}`,
    {
      method: "DELETE",
      headers: { Authorization: authHeader },
    },
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "unknown");
    throw new Error(`VPN delete API ${resp.status}: ${text}`);
  }

  return existing.serverId;
}

/**
 * Extend an existing VPN client's duration on the server.
 * Automatically detects which server the client lives on.
 * Throws if the client is not found or the API call fails.
 */
export async function extendVpnClient(
  clientName: string,
  durationCode: string,
  baseUrl: string,
): Promise<void> {
  const existing = await findExistingClient(clientName, baseUrl);
  if (!existing) {
    throw new Error(`VPN client not found: ${clientName}`);
  }

  const resp = await fetch(
    `${baseUrl}/api/servers/${existing.serverId}/clients/${existing.id}/extend`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ duration: durationCode }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "unknown");
    throw new Error(`VPN extend API ${resp.status}: ${text}`);
  }
}
