import type { VercelRequest, VercelResponse } from "@vercel/node";

const VPN_BASE = "https://193-108-112-87.nip.io";
const VPN_USER = "shalos";
const VPN_PASS = "DkA8j-ddV_fN";
const SERVER_ID = "4a2b39";

const auth = Buffer.from(`${VPN_USER}:${VPN_PASS}`).toString("base64");
const authHeader = `Basic ${auth}`;

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

async function findExistingClient(name: string): Promise<{ config: string } | null> {
  const resp = await fetch(`${VPN_BASE}/api/servers`, {
    headers: { Authorization: authHeader },
  });
  if (!resp.ok) return null;

  const servers: Server[] = await resp.json();
  const server = servers.find((s) => s.id === SERVER_ID);
  if (!server) return null;

  const client = server.clients.find((c) => c.name === name);
  if (!client) return null;

  return { config: buildConfig(server, client) };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, duration } = req.body ?? {};
  if (!name || !duration) {
    return res.status(400).json({ error: "name and duration are required" });
  }

  try {
    const existing = await findExistingClient(name);
    if (existing) {
      return res.status(200).json(existing);
    }

    const upstream = await fetch(
      `${VPN_BASE}/api/servers/${SERVER_ID}/clients`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ name, duration }),
      },
    );

    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    return res.send(body);
  } catch (err) {
    console.error("VPN proxy error:", err);
    return res.status(502).json({ error: "Failed to reach VPN server" });
  }
}
