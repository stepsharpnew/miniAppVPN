const VPN_BASE = (process.env.VPN_BASE_URL ?? "https://193-108-112-87.nip.io").replace(/\/+$/, "");
const VPN_USER = process.env.VPN_API_USER ?? "shalos";
const VPN_PASS = process.env.VPN_API_PASSWORD ?? "DkA8j-ddV_fN";
const SERVER_ID = process.env.VPN_SERVER_ID ?? "4a2b39";

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

async function findExistingClient(name: string): Promise<string | null> {
  const resp = await fetch(`${VPN_BASE}/api/servers`, {
    headers: { Authorization: authHeader },
  });
  if (!resp.ok) return null;

  const servers: Server[] = await resp.json();
  const server = servers.find((s) => s.id === SERVER_ID);
  if (!server) return null;

  const client = server.clients.find((c) => c.name === name);
  if (!client) return null;

  return buildConfig(server, client);
}

/**
 * Provisions a VPN client: returns an existing config or creates a new one.
 * Throws on network / API errors.
 */
export async function provisionVpnClient(
  clientName: string,
  durationCode: string,
): Promise<string> {
  const existing = await findExistingClient(clientName);
  if (existing) return existing;

  const resp = await fetch(`${VPN_BASE}/api/servers/${SERVER_ID}/clients`, {
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
