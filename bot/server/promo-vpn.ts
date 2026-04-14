import { PRICING } from "../shared/plans";
import { getConfig, saveConfig } from "./config-store";
import {
  getAllEnabledServers,
  getRandomEnabledServer,
  incrementServerUserCount,
  type ServerRow,
  type UserRow,
  updateUserVpnConfig,
} from "./db";
import { extendVpnClient, provisionVpnClient } from "./vpn";

function getServerBaseUrl(server: ServerRow): string {
  const raw = server.domain_server_name;
  if (!raw) throw new Error(`Server ${server.server_id} has no domain_server_name`);
  return raw.replace(/\/+$/, "");
}

function getDurationCode(months: number): string {
  const plan = PRICING.find((p) => p.months === months);
  if (!plan) throw new Error(`Unsupported promo duration: ${months}`);
  return plan.durationCode;
}

export function getTelegramClientName(
  telegramId: number,
  username?: string | null,
): string {
  const trimmed = username?.trim();
  return trimmed ? trimmed : `tg_${telegramId}`;
}

export function getWebClientName(user: UserRow): string {
  return user.email?.replace(/[^a-zA-Z0-9_-]/g, "_") ?? `web_${user.id.slice(0, 8)}`;
}

export async function syncVpnForPromoRedemption(
  user: UserRow,
  months: number,
  clientName: string,
): Promise<{ config: string | null }> {
  const durationCode = getDurationCode(months);
  let config = user.vpn_config ?? getConfig(user.id) ?? null;

  if (config) {
    if (!user.vpn_config) {
      await updateUserVpnConfig(user.id, config);
    }

    const servers = await getAllEnabledServers();
    let extended = false;
    for (const srv of servers) {
      try {
        await extendVpnClient(clientName, durationCode, getServerBaseUrl(srv));
        extended = true;
        break;
      } catch {
        /* client not on this VM, try next */
      }
    }

    if (!extended) {
      console.error("VPN extend after promo failed: client not found on any server");
    }

    return { config };
  }

  const server = await getRandomEnabledServer();
  if (!server?.server_id) {
    throw new Error("No enabled VPN servers in DB");
  }

  config = await provisionVpnClient(
    clientName,
    durationCode,
    server.server_id,
    getServerBaseUrl(server),
  );
  saveConfig(user.id, config);
  await updateUserVpnConfig(user.id, config);
  await incrementServerUserCount(server.server_id).catch(() => {});

  return { config };
}
