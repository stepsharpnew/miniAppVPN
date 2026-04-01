import { Pool } from "pg";

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 10 });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
        config_number INTEGER NOT NULL CHECK (config_number IN (1, 2)),
        server_id VARCHAR(255),
        vpn_config TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (user_telegram_id, config_number)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_configurations_user_id
      ON user_configurations(user_telegram_id)
    `);
    console.log("PostgreSQL connected");
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
}

export interface UserRow {
  telegram_id: number;
  is_blocked: boolean;
  telegram_nickname: string | null;
  expired_at: string | null;
  vpn_config: string | null;
  created_at: string;
}

export interface UserConfigurationRow {
  id: string;
  user_telegram_id: number;
  config_number: number;
  server_id: string | null;
  vpn_config: string;
  created_at: string;
}

/**
 * Create user if missing, then extend subscription by `months`.
 * If the user already has an active subscription (expired_at > now),
 * the new period is added on top; otherwise it starts from now.
 * Optionally saves VPN config alongside the subscription.
 */
export async function upsertUserSubscription(
  telegramId: number,
  months: number,
  vpnConfig?: string,
  telegramNickname?: string | null,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (telegram_id, expired_at, vpn_config, telegram_nickname)
     VALUES ($1, NOW() + make_interval(months => $2), $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE
       SET expired_at = CASE
         WHEN users.expired_at IS NOT NULL AND users.expired_at > NOW()
           THEN users.expired_at + make_interval(months => $2)
           ELSE NOW() + make_interval(months => $2)
       END,
       vpn_config = COALESCE($3, users.vpn_config),
       telegram_nickname = COALESCE($4, users.telegram_nickname)
     RETURNING *`,
    [telegramId, months, vpnConfig ?? null, telegramNickname ?? null],
  );
  return rows[0];
}

export async function getUserSubscription(
  telegramId: number,
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "SELECT * FROM users WHERE telegram_id = $1",
    [telegramId],
  );
  return rows[0] ?? null;
}

export async function getUserConfigurations(
  telegramId: number,
): Promise<UserConfigurationRow[]> {
  const { rows } = await getPool().query<UserConfigurationRow>(
    `SELECT *
     FROM user_configurations
     WHERE user_telegram_id = $1
     ORDER BY config_number ASC`,
    [telegramId],
  );
  return rows;
}

export async function upsertUserConfiguration(
  telegramId: number,
  configNumber: 1 | 2,
  vpnConfig: string,
  serverId?: string | null,
): Promise<UserConfigurationRow> {
  const { rows } = await getPool().query<UserConfigurationRow>(
    `INSERT INTO user_configurations (user_telegram_id, config_number, vpn_config, server_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_telegram_id, config_number) DO UPDATE
       SET vpn_config = EXCLUDED.vpn_config,
           server_id = COALESCE(EXCLUDED.server_id, user_configurations.server_id)
     RETURNING *`,
    [telegramId, configNumber, vpnConfig, serverId ?? null],
  );
  return rows[0];
}

export async function ensureLegacyConfigMigrated(
  telegramId: number,
): Promise<void> {
  const existing = await getUserConfigurations(telegramId);
  const hasFirst = existing.some((c) => c.config_number === 1);
  if (hasFirst) return;

  const user = await getUserSubscription(telegramId);
  if (!user?.vpn_config) return;
  await upsertUserConfiguration(telegramId, 1, user.vpn_config);
}

// ── Servers ──

export interface ServerRow {
  id: string;
  name_server: string | null;
  location: string | null;
  ip_address: string | null;
  port_api: string | null;
  server_id: string;
  is_vip: boolean;
  enable: boolean;
  domain_server_name: string | null;
  user_count: number;
}

export async function getRandomEnabledServer(): Promise<ServerRow | null> {
  const { rows } = await getPool().query<ServerRow>(
    "SELECT * FROM servers WHERE enable = TRUE ORDER BY RANDOM() LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function getAllEnabledServers(): Promise<ServerRow[]> {
  const { rows } = await getPool().query<ServerRow>(
    "SELECT * FROM servers WHERE enable = TRUE",
  );
  return rows;
}

export async function getEnabledServersByIds(ids: string[]): Promise<ServerRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await getPool().query<ServerRow>(
    "SELECT * FROM servers WHERE enable = TRUE AND server_id = ANY($1::text[])",
    [ids],
  );
  return rows;
}

export async function incrementServerUserCount(
  serverId: string,
): Promise<void> {
  await getPool().query(
    "UPDATE servers SET user_count = user_count + 1 WHERE server_id = $1",
    [serverId],
  );
}
