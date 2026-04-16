import crypto from "crypto";
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

export async function createTelegramUserIfMissing(
  telegramId: number,
  telegramNickname?: string | null,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (telegram_id, telegram_nickname, auth_source)
     VALUES ($1, $2, 'telegram')
     ON CONFLICT (telegram_id) DO UPDATE
       SET telegram_nickname = COALESCE(users.telegram_nickname, EXCLUDED.telegram_nickname)
     RETURNING *`,
    [telegramId, telegramNickname ?? null],
  );
  return rows[0];
}

// ── Sync: link email to existing telegram user (new registration) ──

export async function linkEmailToTelegramUser(
  telegramId: number,
  email: string,
  passwordHash: string,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET email = $2,
         password_hash = $3,
         auth_source = 'both'
     WHERE telegram_id = $1
     RETURNING *`,
    [telegramId, email, passwordHash],
  );
  return rows[0];
}

export async function updateUserVpnConfig(
  userId: string,
  vpnConfig: string,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET vpn_config = $2
     WHERE id = $1
     RETURNING *`,
    [userId, vpnConfig],
  );
  return rows[0];
}

/**
 * Merge a telegram-only user into an existing web-only user.
 * Transfers telegram_id, nickname, and the best subscription to the web user row,
 * then deletes the orphaned telegram-only row.
 */
export async function mergeAccounts(
  telegramUserId: string,
  webUserId: string,
  telegramId: number,
  telegramNickname: string | null,
): Promise<UserRow> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: [tgUser] } = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [telegramUserId],
    );
    const { rows: [webUser] } = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [webUserId],
    );

    if (!tgUser || !webUser) throw new Error("User not found during merge");

    if (telegramUserId === webUserId) {
      const { rows: [sameUser] } = await client.query<UserRow>(
        `UPDATE users
         SET auth_source = 'both',
             telegram_nickname = COALESCE($2, telegram_nickname)
         WHERE id = $1
         RETURNING *`,
        [webUserId, telegramNickname],
      );
      await client.query("COMMIT");
      return sameUser;
    }

    const tgExpiry = tgUser.expired_at ? new Date(tgUser.expired_at).getTime() : 0;
    const webExpiry = webUser.expired_at ? new Date(webUser.expired_at).getTime() : 0;
    const bestExpiry = tgExpiry > webExpiry ? tgUser.expired_at : webUser.expired_at;
    const bestConfig = tgExpiry > webExpiry
      ? (tgUser.vpn_config ?? webUser.vpn_config)
      : (webUser.vpn_config ?? tgUser.vpn_config);

    // Detach telegram_id from old Telegram-only row first to avoid unique-constraint race.
    await client.query(
      `UPDATE users
       SET telegram_id = NULL
       WHERE id = $1`,
      [telegramUserId],
    );

    const { rows: [merged] } = await client.query<UserRow>(
      `UPDATE users
       SET telegram_id = $2,
           telegram_nickname = COALESCE($3, telegram_nickname),
           auth_source = 'both',
           expired_at = COALESCE($4, expired_at),
           vpn_config = COALESCE($5, vpn_config),
           is_notificated_d3 = FALSE,
           is_notificated_d1 = FALSE
       WHERE id = $1
       RETURNING *`,
      [webUserId, telegramId, telegramNickname, bestExpiry, bestConfig],
    );

    // Reassign FK references from the old Telegram row to the merged web row before deleting.
    await client.query(
      "UPDATE promo_attempts SET user_id = $1 WHERE user_id = $2",
      [webUserId, telegramUserId],
    );
    await client.query(
      "UPDATE promo_codes SET used_by = $1 WHERE used_by = $2",
      [webUserId, telegramUserId],
    );

    await client.query("DELETE FROM users WHERE id = $1", [telegramUserId]);

    await client.query("COMMIT");
    return merged;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserByTelegramId(
  telegramId: number,
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "SELECT * FROM users WHERE telegram_id = $1",
    [telegramId],
  );
  return rows[0] ?? null;
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await getPool().query(
    "UPDATE users SET password_hash = $1 WHERE id = $2",
    [passwordHash, userId],
  );
}

// ── Payment idempotency ──

export async function isPaymentProcessed(paymentId: string): Promise<boolean> {
  const { rows } = await getPool().query(
    "SELECT 1 FROM processed_payments WHERE payment_id = $1",
    [paymentId],
  );
  return rows.length > 0;
}

export async function markPaymentProcessed(paymentId: string): Promise<boolean> {
  try {
    await getPool().query(
      "INSERT INTO processed_payments (payment_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [paymentId],
    );
    return true;
  } catch {
    return false;
  }
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

// ── Promo codes ──

const PROMO_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PROMO_LENGTH = 8;
const PROMO_RATE_LIMIT = 5;
const PROMO_WINDOW_INTERVAL = "1 hour";

function generateCode(): string {
  const bytes = crypto.randomBytes(PROMO_LENGTH);
  return Array.from(bytes)
    .map((b) => PROMO_ALPHABET[b % PROMO_ALPHABET.length])
    .join("");
}

export async function generatePromoCodes(
  count: number,
  months: 1 | 3 | 6,
): Promise<string[]> {
  const codes: string[] = [];
  const pool = getPool();
  for (let i = 0; i < count; i++) {
    let code: string;
    let inserted = false;
    while (!inserted) {
      code = generateCode();
      const { rowCount } = await pool.query(
        `INSERT INTO promo_codes (code, months) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [code, months],
      );
      if ((rowCount ?? 0) > 0) {
        codes.push(code!);
        inserted = true;
      }
    }
  }
  return codes;
}

export type PromoRedeemError = "not_found" | "already_used" | "rate_limited";

export interface PromoRedeemResult {
  ok: boolean;
  error?: PromoRedeemError;
  months?: number;
  oldExpiredAt?: string | null;
  newExpiredAt?: string;
}

/**
 * Atomically redeem a promo code for a user.
 * Rate-limit: 5 failed attempts per hour per user_id.
 */
export async function redeemPromoCode(
  userId: string,
  rawCode: string,
): Promise<PromoRedeemResult> {
  const code = rawCode.trim().toUpperCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: limitRows } = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM promo_attempts
       WHERE user_id = $1
         AND success = FALSE
         AND attempted_at > NOW() - INTERVAL '${PROMO_WINDOW_INTERVAL}'`,
      [userId],
    );
    if (parseInt(limitRows[0].cnt, 10) >= PROMO_RATE_LIMIT) {
      await client.query("ROLLBACK");
      return { ok: false, error: "rate_limited" };
    }

    const { rows: codeRows } = await client.query<{
      id: string;
      months: number;
      used_at: string | null;
    }>(
      `SELECT id, months, used_at FROM promo_codes WHERE code = $1 FOR UPDATE`,
      [code],
    );

    if (codeRows.length === 0) {
      await client.query(
        `INSERT INTO promo_attempts (user_id, code, success) VALUES ($1, $2, FALSE)`,
        [userId, code],
      );
      await client.query("COMMIT");
      return { ok: false, error: "not_found" };
    }

    const promo = codeRows[0];
    if (promo.used_at !== null) {
      await client.query(
        `INSERT INTO promo_attempts (user_id, code, success) VALUES ($1, $2, FALSE)`,
        [userId, code],
      );
      await client.query("COMMIT");
      return { ok: false, error: "already_used" };
    }

    await client.query(
      `UPDATE promo_codes SET used_at = NOW(), used_by = $1 WHERE id = $2`,
      [userId, promo.id],
    );

    const { rows: userRows } = await client.query<{ expired_at: string | null }>(
      `SELECT expired_at FROM users WHERE id = $1`,
      [userId],
    );
    const oldExpiredAt = userRows[0]?.expired_at ?? null;

    const { rows: updatedRows } = await client.query<{ expired_at: string }>(
      `UPDATE users
       SET expired_at = CASE
         WHEN expired_at IS NOT NULL AND expired_at > NOW()
           THEN expired_at + make_interval(months => $2)
           ELSE NOW() + make_interval(months => $2)
       END,
       is_notificated_d3 = FALSE,
       is_notificated_d1 = FALSE
       WHERE id = $1
       RETURNING expired_at`,
      [userId, promo.months],
    );

    await client.query(
      `INSERT INTO promo_attempts (user_id, code, success) VALUES ($1, $2, TRUE)`,
      [userId, code],
    );

    await client.query("COMMIT");
    return {
      ok: true,
      months: promo.months,
      oldExpiredAt,
      newExpiredAt: updatedRows[0].expired_at,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
