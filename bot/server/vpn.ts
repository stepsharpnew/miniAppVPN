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
): Promise<string> {
  const existing = await findExistingClient(clientName, baseUrl);
  if (existing) return existing.config;

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
