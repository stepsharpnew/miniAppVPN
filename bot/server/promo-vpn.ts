import { PRICING } from "../shared/plans";
import { getConfig, saveConfig } from "./config-store";
import {
  getAllEnabledServers,
  getHappPanelServer,
  getPool,
  getRandomEnabledServer,
  incrementServerUserCount,
  type ReferralRewardParty,
  type ReferralRewardResult,
  type ServerRow,
  type UserRow,
  updateUserHappUrl,
  updateUserVpnConfig,
} from "./db";
import { extendHapp, provisionHapp } from "./happ";
import {
  deleteVpnClient,
  extendVpnClient,
  provisionVpnClient,
  provisionVpnClientUntilExpiry,
} from "./vpn";

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
  // Имя VPN-клиента детерминировано из login: для существующих пользователей,
  // у которых раньше login = их прежний email, имя остаётся прежним
  // (валидные символы email — латиница/цифры/._-/@ — попадают в безопасный набор
  // или заменяются на «_»). Менять login после первой провизии нельзя,
  // иначе extendVpnClient не найдёт клиента.
  return user.login?.replace(/[^a-zA-Z0-9_-]/g, "_") ?? `web_${user.id.slice(0, 8)}`;
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

function partyVpnClientName(party: ReferralRewardParty): string | null {
  if (party.telegramId != null) {
    return getTelegramClientName(party.telegramId, party.telegramNickname);
  }
  if (party.login) {
    return getWebClientName({ login: party.login, id: party.userId } as UserRow);
  }
  return null;
}

async function extendHappForParty(
  party: ReferralRewardParty,
  months: number,
): Promise<void> {
  const happPanel = await getHappPanelServer();
  if (!happPanel) return;

  const clientName = partyVpnClientName(party);
  if (!clientName) return;

  const durationCode = getDurationCode(months);
  try {
    const { rows } = await getPool().query<{ happ_subscription_url: string | null }>(
      "SELECT happ_subscription_url FROM users WHERE id = $1",
      [party.userId],
    );
    const existingHappUrl = rows[0]?.happ_subscription_url ?? null;

    if (existingHappUrl) {
      await extendHapp(happPanel, clientName, durationCode);
    } else {
      const result = await provisionHapp(happPanel, clientName, durationCode);
      await updateUserHappUrl(party.userId, result.url);
    }
  } catch (err) {
    console.error("HAPP extend for referral party failed:", { userId: party.userId, err });
  }
}

async function extendVpnForParty(
  party: ReferralRewardParty,
  months: number,
): Promise<void> {
  const clientName = partyVpnClientName(party);
  if (!clientName) {
    console.error(
      "Referral VPN extend: cannot derive client name",
      { userId: party.userId },
    );
    return;
  }
  const durationCode = getDurationCode(months);
  const servers = await getAllEnabledServers();
  for (const srv of servers) {
    try {
      await extendVpnClient(clientName, durationCode, getServerBaseUrl(srv));
      return;
    } catch {
      /* client not on this VM, try next */
    }
  }
  console.error(
    "Referral VPN extend: client not found on any server",
    { userId: party.userId, clientName },
  );
}

export interface ReissueVpnResult {
  config: string;
  /** null — клиент не найден ни на одном сервере (выдан как новый) */
  deletedFromServerId: string | null;
  newServerId: string;
}

/**
 * Смена сервера: создать клиента на другом сервере с тем же сроком действия,
 * затем удалить со старого.
 *
 * Порядок: сначала создать → потом удалить, чтобы при сбое удаления пользователь
 * не остался без конфига. Старый клиент протухнет по expires_at.
 */
export async function reissueVpnConfig(
  user: UserRow,
  clientName: string,
): Promise<ReissueVpnResult> {
  const expiredAt = user.expired_at ? new Date(user.expired_at) : null;
  if (!expiredAt || expiredAt.getTime() <= Date.now()) {
    throw new Error("subscription_inactive");
  }

  const allServers = await getAllEnabledServers();
  if (allServers.length < 2) {
    throw new Error("no_other_servers");
  }

  // Шаг 1: найти старый сервер (обходим все, ищем клиента)
  let oldWgServerId: string | null = null;
  for (const srv of allServers) {
    try {
      const baseUrl = getServerBaseUrl(srv);
      // findExistingClient ищет по всем WireGuard-серверам на этой VM,
      // deleteVpnClient вернёт WG server_id если нашёл
      const found = await deleteVpnClient(clientName, baseUrl).catch(() => null);
      if (found !== null) {
        // Запоминаем DB server_id (uuid) для исключения при выборе нового
        oldWgServerId = srv.server_id;
        break;
      }
    } catch {
      // узел недоступен — пропускаем
    }
  }

  // Шаг 2: выбрать новый сервер (исключить тот, на котором был клиент)
  const candidates = allServers.filter((s) => s.server_id !== oldWgServerId);
  if (candidates.length === 0) {
    throw new Error("no_other_servers");
  }
  const newServer = candidates[Math.floor(Math.random() * candidates.length)];
  const newBaseUrl = getServerBaseUrl(newServer);

  // Шаг 3: провизионировать с тем же сроком (ISO/abs для нового app.py, 1m–12m для старого)
  const config = await provisionVpnClientUntilExpiry(
    clientName,
    expiredAt,
    newServer.server_id,
    newBaseUrl,
  );

  // Шаг 4: сохранить новый конфиг в БД
  saveConfig(user.id, config);
  await updateUserVpnConfig(user.id, config);
  await incrementServerUserCount(newServer.server_id).catch(() => {});

  return {
    config,
    deletedFromServerId: oldWgServerId,
    newServerId: newServer.server_id,
  };
}

/**
 * Sync VPN expiry with the bonus months granted by a referral reward.
 * Without this, the DB's expired_at drifts ahead of the VPN server's
 * expires_at on every paid referral conversion.
 */
export async function syncVpnForReferralReward(
  reward: ReferralRewardResult,
): Promise<void> {
  if (!reward.applied) return;

  if (reward.invitedUser && reward.invitedBonusMonths > 0) {
    await extendVpnForParty(reward.invitedUser, reward.invitedBonusMonths);
    await extendHappForParty(reward.invitedUser, reward.invitedBonusMonths);
  }
  if (reward.referrerUser && reward.referrerBonusMonths > 0) {
    await extendVpnForParty(reward.referrerUser, reward.referrerBonusMonths);
    await extendHappForParty(reward.referrerUser, reward.referrerBonusMonths);
  }
}
