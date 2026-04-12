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
    console.log("PostgreSQL connected");
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
}

export interface UserRow {
  id: string;
  telegram_id: number | null;
  email: string | null;
  password_hash: string | null;
  auth_source: string;
  is_blocked: boolean;
  telegram_nickname: string | null;
  expired_at: string | null;
  vpn_config: string | null;
  created_at: string;
  is_notificated_d3?: boolean;
  is_notificated_d1?: boolean;
}

export interface SubscriptionReminderRow {
  id: string;
  telegram_id: number;
  expired_at: string;
  telegram_nickname: string | null;
}

// ── Telegram-flow (существующий функционал бота) ──

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
    `INSERT INTO users (telegram_id, expired_at, vpn_config, telegram_nickname, auth_source)
     VALUES ($1, NOW() + make_interval(months => $2), $3, $4, 'telegram')
     ON CONFLICT (telegram_id) DO UPDATE
       SET expired_at = CASE
         WHEN users.expired_at IS NOT NULL AND users.expired_at > NOW()
           THEN users.expired_at + make_interval(months => $2)
           ELSE NOW() + make_interval(months => $2)
       END,
       vpn_config = COALESCE($3, users.vpn_config),
       telegram_nickname = COALESCE($4, users.telegram_nickname),
       is_notificated_d3 = FALSE,
       is_notificated_d1 = FALSE
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

/** Окно «за 3 дня»: от 1 до 3 суток до конца (не пересекается с напоминанием «за 1 день»). */
export async function fetchUsersForExpiryReminderD3(): Promise<
  SubscriptionReminderRow[]
> {
  const { rows } = await getPool().query<SubscriptionReminderRow>(
    `SELECT id, telegram_id, expired_at, telegram_nickname
     FROM users
     WHERE telegram_id IS NOT NULL
       AND is_blocked = FALSE
       AND expired_at IS NOT NULL
       AND expired_at > NOW()
       AND expired_at <= NOW() + INTERVAL '3 days'
       AND expired_at > NOW() + INTERVAL '1 day'
       AND is_notificated_d3 = FALSE`,
  );
  return rows;
}

/** Окно «за 1 день»: меньше суток до конца, подписка ещё активна. */
export async function fetchUsersForExpiryReminderD1(): Promise<
  SubscriptionReminderRow[]
> {
  const { rows } = await getPool().query<SubscriptionReminderRow>(
    `SELECT id, telegram_id, expired_at, telegram_nickname
     FROM users
     WHERE telegram_id IS NOT NULL
       AND is_blocked = FALSE
       AND expired_at IS NOT NULL
       AND expired_at > NOW()
       AND expired_at <= NOW() + INTERVAL '1 day'
       AND is_notificated_d1 = FALSE`,
  );
  return rows;
}

export async function markExpiryReminderD3Sent(userId: string): Promise<void> {
  await getPool().query(
    "UPDATE users SET is_notificated_d3 = TRUE WHERE id = $1",
    [userId],
  );
}

export async function markExpiryReminderD1Sent(userId: string): Promise<void> {
  await getPool().query(
    "UPDATE users SET is_notificated_d1 = TRUE WHERE id = $1",
    [userId],
  );
}

// ── Web-flow (для сайта — работа по UUID id / email) ──

export async function getUserById(
  id: string,
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "SELECT * FROM users WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function getUserByEmail(
  email: string,
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "SELECT * FROM users WHERE email = $1",
    [email],
  );
  return rows[0] ?? null;
}

export async function createWebUser(
  email: string,
  passwordHash: string,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (email, password_hash, auth_source)
     VALUES ($1, $2, 'web')
     RETURNING *`,
    [email, passwordHash],
  );
  return rows[0];
}

/**
 * Extend subscription for any user by their UUID id.
 * Works the same as upsertUserSubscription but uses the UUID PK.
 */
export async function extendSubscriptionById(
  userId: string,
  months: number,
  vpnConfig?: string,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET expired_at = CASE
       WHEN expired_at IS NOT NULL AND expired_at > NOW()
         THEN expired_at + make_interval(months => $2)
         ELSE NOW() + make_interval(months => $2)
       END,
       vpn_config = COALESCE($3, vpn_config),
       is_notificated_d3 = FALSE,
       is_notificated_d1 = FALSE
     WHERE id = $1
     RETURNING *`,
    [userId, months, vpnConfig ?? null],
  );
  return rows[0];
}

export async function linkTelegramToUser(
  userId: string,
  telegramId: number,
  telegramNickname?: string | null,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET telegram_id = $2,
         telegram_nickname = COALESCE($3, telegram_nickname)
     WHERE id = $1
     RETURNING *`,
    [userId, telegramId, telegramNickname ?? null],
  );
  return rows[0];
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

export async function incrementServerUserCount(
  serverId: string,
): Promise<void> {
  await getPool().query(
    "UPDATE servers SET user_count = user_count + 1 WHERE server_id = $1",
    [serverId],
  );
}
