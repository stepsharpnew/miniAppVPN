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
  referral_code: string | null;
  referred_by_user_id: string | null;
  referral_applied_at: string | null;
  is_notificated_d3?: boolean;
  is_notificated_d1?: boolean;
}

export interface ReferralInfo {
  /** null если код ещё не выдан (на вебе код не выдаётся — только в Mini App). */
  my_referral_code: string | null;
  referred_by_applied: boolean;
  referred_by_code: string | null;
  referral_message: string | null;
  referred_by_user_id: string | null;
}

export type ApplyReferralCodeError =
  | "empty"
  | "not_found"
  | "self_referral"
  | "already_applied";

export interface ApplyReferralCodeResult {
  ok: boolean;
  error?: ApplyReferralCodeError;
  referred_by_user_id?: string;
  applied_at?: string;
  referred_by_code?: string;
  referral_message?: string;
}

export interface ReferralRewardParty {
  userId: string;
  telegramId: number | null;
  email: string | null;
  referralCode: string | null;
}

export interface ReferralRewardResult {
  applied: boolean;
  alreadyRewarded: boolean;
  reason?: "not_referred" | "already_rewarded";
  paymentId: string;
  invitedBonusMonths: number;
  referrerBonusMonths: number;
  isFirstPaidConversion: boolean;
  invitedUserId: string;
  referrerUserId: string | null;
  invitedUser: ReferralRewardParty | null;
  referrerUser: ReferralRewardParty | null;
}

export interface SubscriptionReminderRow {
  id: string;
  telegram_id: number;
  expired_at: string;
  telegram_nickname: string | null;
}

export const REFERRAL_APPLY_SUCCESS_MESSAGE =
  "Промокод успешно применен, при покупке вам будет в подарок 1 месяц";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_BONUS_MONTHS = 1;

function generateRandomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
}

function generateReferralCode(): string {
  return generateRandomCode(REFERRAL_CODE_LENGTH);
}

function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const pgError = error as { code?: string; constraint?: string };
  return pgError.code === "23505" && (!constraintName || pgError.constraint === constraintName);
}

async function getUserReferralCode(userId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ referral_code: string | null }>(
    "SELECT referral_code FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.referral_code ?? null;
}

async function ensureUserReferralCodeForMutation(userId: string): Promise<string> {
  const existingCode = await getUserReferralCode(userId);
  if (existingCode) return existingCode;

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateReferralCode();
    try {
      const { rows } = await getPool().query<{ referral_code: string }>(
        `UPDATE users
         SET referral_code = $2
         WHERE id = $1
           AND referral_code IS NULL
         RETURNING referral_code`,
        [userId, code],
      );
      if (rows[0]?.referral_code) return rows[0].referral_code;

      const currentCode = await getUserReferralCode(userId);
      if (currentCode) return currentCode;
    } catch (error) {
      if (isUniqueViolation(error, "users_referral_code_unique")) continue;
      throw error;
    }
  }

  throw new Error(`Failed to assign referral code for user ${userId}`);
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
  for (let attempt = 0; attempt < 20; attempt++) {
    const referralCode = generateReferralCode();
    try {
      const { rows } = await getPool().query<UserRow>(
        `INSERT INTO users (
           telegram_id,
           expired_at,
           vpn_config,
           telegram_nickname,
           auth_source,
           referral_code
         )
         VALUES ($1, NOW() + make_interval(months => $2), $3, $4, 'telegram', $5)
         ON CONFLICT (telegram_id) DO UPDATE
           SET expired_at = CASE
             WHEN users.expired_at IS NOT NULL AND users.expired_at > NOW()
               THEN users.expired_at + make_interval(months => $2)
               ELSE NOW() + make_interval(months => $2)
           END,
           vpn_config = COALESCE($3, users.vpn_config),
           telegram_nickname = COALESCE($4, users.telegram_nickname),
           referral_code = COALESCE(users.referral_code, EXCLUDED.referral_code),
           is_notificated_d3 = FALSE,
           is_notificated_d1 = FALSE
         RETURNING *`,
        [telegramId, months, vpnConfig ?? null, telegramNickname ?? null, referralCode],
      );
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error, "users_referral_code_unique")) continue;
      throw error;
    }
  }

  throw new Error(`Failed to upsert telegram user ${telegramId} with referral code`);
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
  for (let attempt = 0; attempt < 20; attempt++) {
    const referralCode = generateReferralCode();
    try {
      const { rows } = await getPool().query<UserRow>(
        `INSERT INTO users (telegram_id, telegram_nickname, auth_source, referral_code)
         VALUES ($1, $2, 'telegram', $3)
         ON CONFLICT (telegram_id) DO UPDATE
           SET telegram_nickname = COALESCE(users.telegram_nickname, EXCLUDED.telegram_nickname),
               referral_code = COALESCE(users.referral_code, EXCLUDED.referral_code)
         RETURNING *`,
        [telegramId, telegramNickname ?? null, referralCode],
      );
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error, "users_referral_code_unique")) continue;
      throw error;
    }
  }

  throw new Error(`Failed to create or load telegram user ${telegramId}`);
}

// ── Sync: link email to existing telegram user (new registration) ──

export async function linkEmailToTelegramUser(
  telegramId: number,
  email: string,
  passwordHash: string,
): Promise<UserRow> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const referralCode = generateReferralCode();
    try {
      const { rows } = await getPool().query<UserRow>(
        `UPDATE users
         SET email = $2,
             password_hash = $3,
             auth_source = 'both',
             referral_code = COALESCE(referral_code, $4)
         WHERE telegram_id = $1
         RETURNING *`,
        [telegramId, email, passwordHash, referralCode],
      );
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error, "users_referral_code_unique")) continue;
      throw error;
    }
  }

  throw new Error(`Failed to link email ${email} to telegram user ${telegramId}`);
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

function getComparableTimestamp(value: string | null): number | null {
  return value ? new Date(value).getTime() : null;
}

function pickDeterministicMergeSource(
  telegramUser: UserRow,
  webUser: UserRow,
): UserRow {
  const telegramCreatedAt = new Date(telegramUser.created_at).getTime();
  const webCreatedAt = new Date(webUser.created_at).getTime();

  if (telegramCreatedAt !== webCreatedAt) {
    return telegramCreatedAt < webCreatedAt ? telegramUser : webUser;
  }

  return telegramUser.id.localeCompare(webUser.id) <= 0 ? telegramUser : webUser;
}

function pickMergedReferralAssignment(
  telegramUser: UserRow,
  webUser: UserRow,
): Pick<UserRow, "referred_by_user_id" | "referral_applied_at"> {
  if (telegramUser.referred_by_user_id && !webUser.referred_by_user_id) {
    return {
      referred_by_user_id: telegramUser.referred_by_user_id,
      referral_applied_at: telegramUser.referral_applied_at,
    };
  }

  if (!telegramUser.referred_by_user_id && webUser.referred_by_user_id) {
    return {
      referred_by_user_id: webUser.referred_by_user_id,
      referral_applied_at: webUser.referral_applied_at,
    };
  }

  if (!telegramUser.referred_by_user_id && !webUser.referred_by_user_id) {
    return {
      referred_by_user_id: null,
      referral_applied_at: null,
    };
  }

  if (telegramUser.referred_by_user_id === webUser.referred_by_user_id) {
    const telegramAppliedAt = getComparableTimestamp(telegramUser.referral_applied_at);
    const webAppliedAt = getComparableTimestamp(webUser.referral_applied_at);
    if (telegramAppliedAt !== null && webAppliedAt !== null) {
      return telegramAppliedAt <= webAppliedAt
        ? {
            referred_by_user_id: telegramUser.referred_by_user_id,
            referral_applied_at: telegramUser.referral_applied_at,
          }
        : {
            referred_by_user_id: webUser.referred_by_user_id,
            referral_applied_at: webUser.referral_applied_at,
          };
    }
  }

  const telegramAppliedAt = getComparableTimestamp(telegramUser.referral_applied_at);
  const webAppliedAt = getComparableTimestamp(webUser.referral_applied_at);

  if (telegramAppliedAt !== null && webAppliedAt !== null && telegramAppliedAt !== webAppliedAt) {
    return telegramAppliedAt < webAppliedAt
      ? {
          referred_by_user_id: telegramUser.referred_by_user_id,
          referral_applied_at: telegramUser.referral_applied_at,
        }
      : {
          referred_by_user_id: webUser.referred_by_user_id,
          referral_applied_at: webUser.referral_applied_at,
        };
  }

  if (telegramAppliedAt !== null && webAppliedAt === null) {
    return {
      referred_by_user_id: telegramUser.referred_by_user_id,
      referral_applied_at: telegramUser.referral_applied_at,
    };
  }

  if (telegramAppliedAt === null && webAppliedAt !== null) {
    return {
      referred_by_user_id: webUser.referred_by_user_id,
      referral_applied_at: webUser.referral_applied_at,
    };
  }

  // If timestamps are equal or missing on both sides, prefer the older account,
  // and finally the lexicographically smaller UUID to keep merges deterministic.
  const source = pickDeterministicMergeSource(telegramUser, webUser);
  return {
    referred_by_user_id: source.referred_by_user_id,
    referral_applied_at: source.referral_applied_at,
  };
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
    const mergedReferral = pickMergedReferralAssignment(tgUser, webUser);
    const { rows: [referralUsage] } = await client.query<{
      telegram_code_used: boolean;
      web_code_used: boolean;
    }>(
      `SELECT
         EXISTS (
           SELECT 1 FROM users WHERE referred_by_user_id = $1
         ) OR EXISTS (
           SELECT 1 FROM referral_rewards WHERE referrer_user_id = $1
         ) AS telegram_code_used,
         EXISTS (
           SELECT 1 FROM users WHERE referred_by_user_id = $2
         ) OR EXISTS (
           SELECT 1 FROM referral_rewards WHERE referrer_user_id = $2
         ) AS web_code_used`,
      [telegramUserId, webUserId],
    );
    const mergedReferralCode = (() => {
      if (tgUser.referral_code && webUser.referral_code) {
        if (referralUsage?.telegram_code_used && !referralUsage?.web_code_used) {
          return tgUser.referral_code;
        }
        return webUser.referral_code;
      }
      return webUser.referral_code ?? tgUser.referral_code ?? null;
    })();
    const transferredReferralCode = mergedReferralCode === tgUser.referral_code
      ? tgUser.referral_code
      : null;

    // Detach telegram_id from old Telegram-only row first to avoid unique-constraint race.
    await client.query(
      `UPDATE users
       SET telegram_id = NULL,
           referral_code = CASE
             WHEN $2 IS NOT NULL THEN NULL
             ELSE referral_code
           END
       WHERE id = $1`,
      [telegramUserId, transferredReferralCode],
    );

    const { rows: [merged] } = await client.query<UserRow>(
      `UPDATE users
       SET telegram_id = $2,
           telegram_nickname = COALESCE($3, telegram_nickname),
           auth_source = 'both',
           expired_at = COALESCE($4, expired_at),
           vpn_config = COALESCE($5, vpn_config),
           referred_by_user_id = $6,
           referral_applied_at = $7,
           referral_code = COALESCE(referral_code, $8),
           is_notificated_d3 = FALSE,
           is_notificated_d1 = FALSE
       WHERE id = $1
       RETURNING *`,
      [
        webUserId,
        telegramId,
        telegramNickname,
        bestExpiry,
        bestConfig,
        mergedReferral.referred_by_user_id,
        mergedReferral.referral_applied_at,
        mergedReferralCode,
      ],
    );

    // Reassign FK references from the old Telegram row to the merged web row before deleting.
    await client.query(
      "UPDATE users SET referred_by_user_id = $1 WHERE referred_by_user_id = $2",
      [webUserId, telegramUserId],
    );
    await client.query(
      "UPDATE promo_attempts SET user_id = $1 WHERE user_id = $2",
      [webUserId, telegramUserId],
    );
    await client.query(
      "UPDATE promo_codes SET used_by = $1 WHERE used_by = $2",
      [webUserId, telegramUserId],
    );
    await client.query(
      "UPDATE referral_rewards SET invited_user_id = $1 WHERE invited_user_id = $2",
      [webUserId, telegramUserId],
    );
    await client.query(
      "UPDATE referral_rewards SET referrer_user_id = $1 WHERE referrer_user_id = $2",
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

async function extendSubscriptionWithClient(
  client: Pick<Pool, "query">,
  userId: string,
  months: number,
): Promise<void> {
  await client.query(
    `UPDATE users
     SET expired_at = CASE
       WHEN expired_at IS NOT NULL AND expired_at > NOW()
         THEN expired_at + make_interval(months => $2)
         ELSE NOW() + make_interval(months => $2)
     END,
     is_notificated_d3 = FALSE,
     is_notificated_d1 = FALSE
     WHERE id = $1`,
    [userId, months],
  );
}

function mapReferralParty(
  user: Pick<UserRow, "id" | "telegram_id" | "email" | "referral_code">,
): ReferralRewardParty {
  return {
    userId: user.id,
    telegramId: user.telegram_id,
    email: user.email,
    referralCode: user.referral_code,
  };
}

export async function getOrCreateUserReferralCode(userId: string): Promise<string> {
  return ensureUserReferralCodeForMutation(userId);
}

export async function getUserReferralInfo(userId: string): Promise<ReferralInfo> {
  const myReferralCode = await getOrCreateUserReferralCode(userId);
  const { rows } = await getPool().query<{
    referred_by_user_id: string | null;
    referred_by_code: string | null;
  }>(
    `SELECT u.referred_by_user_id, ref.referral_code AS referred_by_code
     FROM users u
     LEFT JOIN users ref ON ref.id = u.referred_by_user_id
     WHERE u.id = $1`,
    [userId],
  );

  if (!rows[0]) throw new Error(`User ${userId} not found`);

  return {
    my_referral_code: myReferralCode,
    referred_by_applied: rows[0].referred_by_user_id !== null,
    referred_by_code: rows[0].referred_by_code ?? null,
    referral_message:
      rows[0].referred_by_user_id !== null ? REFERRAL_APPLY_SUCCESS_MESSAGE : null,
    referred_by_user_id: rows[0].referred_by_user_id,
  };
}

/** Для сайта: не создаёт referral_code (выдача только через Mini App). */
export async function getUserReferralInfoForWeb(userId: string): Promise<ReferralInfo> {
  const myReferralCode = await getUserReferralCode(userId);
  const { rows } = await getPool().query<{
    referred_by_user_id: string | null;
    referred_by_code: string | null;
  }>(
    `SELECT u.referred_by_user_id, ref.referral_code AS referred_by_code
     FROM users u
     LEFT JOIN users ref ON ref.id = u.referred_by_user_id
     WHERE u.id = $1`,
    [userId],
  );

  if (!rows[0]) throw new Error(`User ${userId} not found`);

  return {
    my_referral_code: myReferralCode,
    referred_by_applied: rows[0].referred_by_user_id !== null,
    referred_by_code: rows[0].referred_by_code ?? null,
    referral_message:
      rows[0].referred_by_user_id !== null ? REFERRAL_APPLY_SUCCESS_MESSAGE : null,
    referred_by_user_id: rows[0].referred_by_user_id,
  };
}

export async function applyReferralCode(
  userId: string,
  rawCode: string,
): Promise<ApplyReferralCodeResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "empty" };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: userRows } = await client.query<UserRow>(
      `SELECT *
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );
    const user = userRows[0];
    if (!user) throw new Error(`User ${userId} not found`);

    if (user.referred_by_user_id) {
      await client.query("COMMIT");
      return { ok: false, error: "already_applied" };
    }

    const { rows: referrerRows } = await client.query<UserRow>(
      `SELECT *
       FROM users
       WHERE referral_code = $1
       FOR UPDATE`,
      [code],
    );
    const referrer = referrerRows[0];
    if (!referrer) {
      await client.query("COMMIT");
      return { ok: false, error: "not_found" };
    }

    if (referrer.id === userId) {
      await client.query("COMMIT");
      return { ok: false, error: "self_referral" };
    }

    const { rows: appliedRows } = await client.query<{
      referred_by_user_id: string;
      referral_applied_at: string;
    }>(
      `UPDATE users
       SET referred_by_user_id = $2,
           referral_applied_at = NOW()
       WHERE id = $1
         AND referred_by_user_id IS NULL
       RETURNING referred_by_user_id, referral_applied_at`,
      [userId, referrer.id],
    );

    if (!appliedRows[0]) {
      await client.query("COMMIT");
      return { ok: false, error: "already_applied" };
    }

    await client.query("COMMIT");
    return {
      ok: true,
      referred_by_user_id: appliedRows[0].referred_by_user_id,
      applied_at: appliedRows[0].referral_applied_at,
      referred_by_code: referrer.referral_code ?? code,
      referral_message: REFERRAL_APPLY_SUCCESS_MESSAGE,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function applyReferralRewardsForPayment(
  paymentId: string,
  invitedUserId: string,
): Promise<ReferralRewardResult> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: invitedRows } = await client.query<UserRow>(
      `SELECT *
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [invitedUserId],
    );
    const invitedUser = invitedRows[0];
    if (!invitedUser) throw new Error(`Invited user ${invitedUserId} not found`);

    if (!invitedUser.referred_by_user_id) {
      await client.query("COMMIT");
      return {
        applied: false,
        alreadyRewarded: false,
        reason: "not_referred",
        paymentId,
        invitedBonusMonths: REFERRAL_BONUS_MONTHS,
        referrerBonusMonths: REFERRAL_BONUS_MONTHS,
        isFirstPaidConversion: false,
        invitedUserId,
        referrerUserId: null,
        invitedUser: mapReferralParty(invitedUser),
        referrerUser: null,
      };
    }

    const { rows: referrerRows } = await client.query<UserRow>(
      `SELECT *
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [invitedUser.referred_by_user_id],
    );
    const referrerUser = referrerRows[0];
    if (!referrerUser) {
      await client.query("COMMIT");
      return {
        applied: false,
        alreadyRewarded: false,
        reason: "not_referred",
        paymentId,
        invitedBonusMonths: REFERRAL_BONUS_MONTHS,
        referrerBonusMonths: REFERRAL_BONUS_MONTHS,
        isFirstPaidConversion: false,
        invitedUserId,
        referrerUserId: null,
        invitedUser: mapReferralParty(invitedUser),
        referrerUser: null,
      };
    }

    const { rows: insertedRows } = await client.query<{
      invited_bonus_months: number;
      referrer_bonus_months: number;
      is_first_paid_conversion: boolean;
    }>(
      `WITH prior_reward AS (
         SELECT EXISTS (
           SELECT 1
           FROM referral_rewards
           WHERE invited_user_id = $2
             AND referrer_user_id = $3
         ) AS has_prior_reward
       ),
       inserted AS (
         INSERT INTO referral_rewards (
           payment_id,
           invited_user_id,
           referrer_user_id,
           invited_bonus_months,
           referrer_bonus_months,
           is_first_paid_conversion
         )
         SELECT
           $1,
           $2,
           $3,
           $4,
           $4,
           NOT has_prior_reward
         FROM prior_reward
         ON CONFLICT (payment_id) DO NOTHING
         RETURNING invited_bonus_months, referrer_bonus_months, is_first_paid_conversion
       )
       SELECT * FROM inserted`,
      [paymentId, invitedUserId, referrerUser.id, REFERRAL_BONUS_MONTHS],
    );

    if (!insertedRows[0]) {
      const { rows: existingRows } = await client.query<{
        invited_bonus_months: number;
        referrer_bonus_months: number;
        is_first_paid_conversion: boolean;
      }>(
        `SELECT invited_bonus_months, referrer_bonus_months, is_first_paid_conversion
         FROM referral_rewards
         WHERE payment_id = $1`,
        [paymentId],
      );

      await client.query("COMMIT");
      return {
        applied: false,
        alreadyRewarded: true,
        reason: "already_rewarded",
        paymentId,
        invitedBonusMonths:
          existingRows[0]?.invited_bonus_months ?? REFERRAL_BONUS_MONTHS,
        referrerBonusMonths:
          existingRows[0]?.referrer_bonus_months ?? REFERRAL_BONUS_MONTHS,
        isFirstPaidConversion: existingRows[0]?.is_first_paid_conversion ?? false,
        invitedUserId,
        referrerUserId: referrerUser.id,
        invitedUser: mapReferralParty(invitedUser),
        referrerUser: mapReferralParty(referrerUser),
      };
    }

    // Keep reward insert and month extensions in one transaction so duplicate
    // webhooks/status polls cannot ever grant the same referral bonus twice.
    await extendSubscriptionWithClient(
      client,
      invitedUser.id,
      insertedRows[0].invited_bonus_months,
    );
    await extendSubscriptionWithClient(
      client,
      referrerUser.id,
      insertedRows[0].referrer_bonus_months,
    );

    await client.query("COMMIT");
    return {
      applied: true,
      alreadyRewarded: false,
      paymentId,
      invitedBonusMonths: insertedRows[0].invited_bonus_months,
      referrerBonusMonths: insertedRows[0].referrer_bonus_months,
      isFirstPaidConversion: insertedRows[0].is_first_paid_conversion,
      invitedUserId,
      referrerUserId: referrerUser.id,
      invitedUser: mapReferralParty(invitedUser),
      referrerUser: mapReferralParty(referrerUser),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

const PROMO_LENGTH = 8;
const PROMO_RATE_LIMIT = 5;
const PROMO_WINDOW_INTERVAL = "1 hour";

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
      code = generateRandomCode(PROMO_LENGTH);
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
