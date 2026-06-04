import crypto from "crypto";
import { Pool } from "pg";

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 30 });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
    // Safety net if create_tables.sql did not reach the HAPP section (e.g. failed mid-file).
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS happ_subscription_url TEXT",
    );
    await client.query(
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS supports_happ BOOLEAN NOT NULL DEFAULT FALSE",
    );
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_version INTEGER NOT NULL DEFAULT 0",
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS promo_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL UNIQUE,
        months SMALLINT NOT NULL CHECK (months IN (1, 3, 6)),
        kind TEXT NOT NULL DEFAULT 'single_use',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        deactivated_at TIMESTAMP WITH TIME ZONE,
        used_at TIMESTAMP WITH TIME ZONE,
        used_by UUID REFERENCES users(id)
      )`,
    );
    await client.query(
      "ALTER TABLE promo_codes ALTER COLUMN code TYPE VARCHAR(32) USING btrim(code::text)",
    );
    await client.query(
      "ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'single_use'",
    );
    await client.query(
      "ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
    );
    await client.query(
      "ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()",
    );
    await client.query(
      "ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE",
    );
    await client.query(
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'promo_codes_kind_check'
        ) THEN
          ALTER TABLE promo_codes
            ADD CONSTRAINT promo_codes_kind_check CHECK (kind IN ('single_use', 'multi_use'));
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'promo_codes_code_format_check'
        ) THEN
          ALTER TABLE promo_codes
            ADD CONSTRAINT promo_codes_code_format_check CHECK (code ~ '^[A-Z0-9_-]{3,32}$');
        END IF;
      END $$`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS promo_redemptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
        user_id UUID NOT NULL REFERENCES users(id),
        redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (promo_code_id, user_id)
      )`,
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS promo_redemptions_user_idx ON promo_redemptions (user_id, redeemed_at)",
    );
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
  login: string | null;
  password_hash: string | null;
  auth_source: string;
  is_blocked: boolean;
  telegram_nickname: string | null;
  expired_at: string | null;
  vpn_config: string | null;
  happ_subscription_url: string | null;
  created_at: string;
  referral_code: string | null;
  referred_by_user_id: string | null;
  referral_applied_at: string | null;
  is_notificated_d3?: boolean;
  is_notificated_d1?: boolean;
  is_notificated_expired?: boolean;
  is_notificated_cancelled?: boolean;
  password_version?: number;
}

export interface ReferralInfo {
  /** null если код ещё не выдан (на вебе код не выдаётся — только в Mini App). */
  my_referral_code: string | null;
  referred_by_applied: boolean;
  referred_by_code: string | null;
  referred_by_nickname: string | null;
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
  telegramNickname: string | null;
  login: string | null;
  referralCode: string | null;
}

export interface ReferralRewardResult {
  applied: boolean;
  alreadyRewarded: boolean;
  reason?: "not_referred" | "already_rewarded";
  paymentId: string;
  invitedBonusMonths: number;
  referrerBonusMonths: number;
  invitedBonusDays: number;
  referrerBonusDays: number;
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
  "Промокод успешно применен, при покупке вам будет в подарок 30 дней";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const REFERRAL_CODE_LENGTH = 8;
/** Legacy constant — kept only for the invited-user fixed bonus. */
const REFERRAL_BONUS_MONTHS = 1;

/** Tiered bonus days awarded to the referrer on each paid conversion. */
const REFERRAL_TIER1_DAYS = 30; // conversions 1-3
const REFERRAL_TIER2_DAYS = 45; // conversions 4-10
const REFERRAL_TIER3_DAYS = 60; // conversions 11+
/** Fixed bonus days for the invited user (always Tier 1). */
const REFERRAL_INVITED_BONUS_DAYS = 30;

function getReferralBonusDaysByRank(rank: number): number {
  if (rank <= 3) return REFERRAL_TIER1_DAYS;
  if (rank <= 10) return REFERRAL_TIER2_DAYS;
  return REFERRAL_TIER3_DAYS;
}

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
           is_notificated_d1 = FALSE,
           is_notificated_expired = FALSE,
           is_notificated_cancelled = FALSE
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

/**
 * Подписка только что истекла (от 0 до 2 дней назад).
 * Отправляем уведомление с предложением продлить в течение 2 дней.
 */
export async function fetchUsersForExpiryExpired(): Promise<
  SubscriptionReminderRow[]
> {
  const { rows } = await getPool().query<SubscriptionReminderRow>(
    `SELECT id, telegram_id, expired_at, telegram_nickname
     FROM users
     WHERE telegram_id IS NOT NULL
       AND is_blocked = FALSE
       AND expired_at IS NOT NULL
       AND expired_at <= NOW()
       AND expired_at > NOW() - INTERVAL '2 days'
       AND is_notificated_expired = FALSE`,
  );
  return rows;
}

/**
 * Грейс-период (2 дня) истёк без оплаты — итоговое уведомление об отмене.
 */
export async function fetchUsersForExpiryCancelled(): Promise<
  SubscriptionReminderRow[]
> {
  const { rows } = await getPool().query<SubscriptionReminderRow>(
    `SELECT id, telegram_id, expired_at, telegram_nickname
     FROM users
     WHERE telegram_id IS NOT NULL
       AND is_blocked = FALSE
       AND expired_at IS NOT NULL
       AND expired_at <= NOW() - INTERVAL '2 days'
       AND is_notificated_cancelled = FALSE`,
  );
  return rows;
}

export async function markExpiryExpiredSent(userId: string): Promise<void> {
  await getPool().query(
    "UPDATE users SET is_notificated_expired = TRUE WHERE id = $1",
    [userId],
  );
}

export async function markExpiryCancelledSent(userId: string): Promise<void> {
  await getPool().query(
    "UPDATE users SET is_notificated_cancelled = TRUE WHERE id = $1",
    [userId],
  );
}

/**
 * Mark a user as having blocked the bot so daily reminder queries stop
 * returning them — otherwise we hammer Telegram with sends that are guaranteed
 * to return 403 forever and never set a reminder flag (since `mark*Sent` only
 * runs on a successful send).
 */
export async function markUserBlockedBot(userId: string): Promise<void> {
  await getPool().query(
    "UPDATE users SET is_blocked = TRUE WHERE id = $1",
    [userId],
  );
}

// ── Web-flow (для сайта — работа по UUID id / login) ──

export async function getUserById(
  id: string,
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "SELECT * FROM users WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function getUserByLogin(
  login: string,
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "SELECT * FROM users WHERE LOWER(login) = LOWER($1)",
    [login],
  );
  return rows[0] ?? null;
}

export async function createWebUser(
  login: string,
  passwordHash: string,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (login, password_hash, auth_source)
     VALUES ($1, $2, 'web')
     RETURNING *`,
    [login, passwordHash],
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
       is_notificated_d1 = FALSE,
       is_notificated_expired = FALSE,
       is_notificated_cancelled = FALSE
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

// ── Sync: link login/password to existing telegram user (new registration) ──

export async function linkLoginToTelegramUser(
  telegramId: number,
  login: string,
  passwordHash: string,
): Promise<UserRow> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const referralCode = generateReferralCode();
    try {
      const { rows } = await getPool().query<UserRow>(
        `UPDATE users
         SET login = $2,
             password_hash = $3,
             auth_source = 'both',
             referral_code = COALESCE(referral_code, $4)
         WHERE telegram_id = $1
         RETURNING *`,
        [telegramId, login, passwordHash, referralCode],
      );
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error, "users_referral_code_unique")) continue;
      throw error;
    }
  }

  throw new Error(`Failed to link login ${login} to telegram user ${telegramId}`);
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
    // Cast $2 explicitly: when transferredReferralCode is null, pg cannot infer the type
    // from `IS NOT NULL` alone and fails with 42P18 (indeterminate_datatype).
    await client.query(
      `UPDATE users
       SET telegram_id = NULL,
           referral_code = CASE
             WHEN $2::text IS NOT NULL THEN NULL
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
           is_notificated_d1 = FALSE,
           is_notificated_expired = FALSE,
           is_notificated_cancelled = FALSE
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
    `UPDATE users
     SET password_hash = $1,
         password_version = COALESCE(password_version, 0) + 1
     WHERE id = $2`,
    [passwordHash, userId],
  );
}

async function extendSubscriptionWithClient(
  client: Pick<Pool, "query">,
  userId: string,
  months: number,
): Promise<void> {
  // Reset ALL four reminder flags — otherwise a previously-cancelled user who
  // got a referral / promo top-up never gets `expired` / `cancelled` reminders
  // for the NEXT expiry cycle (their flag is still TRUE from the previous one).
  await client.query(
    `UPDATE users
     SET expired_at = CASE
       WHEN expired_at IS NOT NULL AND expired_at > NOW()
         THEN expired_at + make_interval(months => $2)
         ELSE NOW() + make_interval(months => $2)
     END,
     is_notificated_d3 = FALSE,
     is_notificated_d1 = FALSE,
     is_notificated_expired = FALSE,
     is_notificated_cancelled = FALSE
     WHERE id = $1`,
    [userId, months],
  );
}

async function extendSubscriptionWithClientByDays(
  client: Pick<Pool, "query">,
  userId: string,
  days: number,
): Promise<void> {
  await client.query(
    `UPDATE users
     SET expired_at = CASE
       WHEN expired_at IS NOT NULL AND expired_at > NOW()
         THEN expired_at + make_interval(days => $2)
         ELSE NOW() + make_interval(days => $2)
     END,
     is_notificated_d3 = FALSE,
     is_notificated_d1 = FALSE,
     is_notificated_expired = FALSE,
     is_notificated_cancelled = FALSE
     WHERE id = $1`,
    [userId, days],
  );
}

function mapReferralParty(
  user: Pick<
    UserRow,
    "id" | "telegram_id" | "telegram_nickname" | "login" | "referral_code"
  >,
): ReferralRewardParty {
  return {
    userId: user.id,
    telegramId: user.telegram_id,
    telegramNickname: user.telegram_nickname,
    login: user.login,
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
    referred_by_nickname: string | null;
  }>(
    `SELECT u.referred_by_user_id,
            ref.referral_code AS referred_by_code,
            ref.telegram_nickname AS referred_by_nickname
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
    referred_by_nickname: rows[0].referred_by_nickname ?? null,
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
    referred_by_nickname: string | null;
  }>(
    `SELECT u.referred_by_user_id,
            ref.referral_code AS referred_by_code,
            ref.telegram_nickname AS referred_by_nickname
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
    referred_by_nickname: rows[0].referred_by_nickname ?? null,
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
        invitedBonusDays: REFERRAL_INVITED_BONUS_DAYS,
        referrerBonusDays: REFERRAL_TIER1_DAYS,
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
        invitedBonusDays: REFERRAL_INVITED_BONUS_DAYS,
        referrerBonusDays: REFERRAL_TIER1_DAYS,
        isFirstPaidConversion: false,
        invitedUserId,
        referrerUserId: null,
        invitedUser: mapReferralParty(invitedUser),
        referrerUser: null,
      };
    }

    // Count referrer's prior paid conversions (before this payment) to determine tier.
    const { rows: convCountRows } = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::TEXT AS cnt FROM referral_rewards WHERE referrer_user_id = $1`,
      [referrerUser.id],
    );
    const priorConversions = parseInt(convCountRows[0]?.cnt ?? "0", 10);
    // This payment will be the (priorConversions + 1)-th conversion (1-indexed).
    const referrerBonusDays = getReferralBonusDaysByRank(priorConversions + 1);
    const invitedBonusDays = REFERRAL_INVITED_BONUS_DAYS;

    const { rows: insertedRows } = await client.query<{
      invited_bonus_months: number;
      referrer_bonus_months: number;
      invited_bonus_days: number;
      referrer_bonus_days: number;
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
           invited_bonus_days,
           referrer_bonus_days,
           is_first_paid_conversion
         )
         SELECT
           $1,
           $2,
           $3,
           1,
           1,
           $4,
           $5,
           NOT has_prior_reward
         FROM prior_reward
         ON CONFLICT (payment_id) DO NOTHING
         RETURNING invited_bonus_months, referrer_bonus_months,
                   invited_bonus_days, referrer_bonus_days, is_first_paid_conversion
       )
       SELECT * FROM inserted`,
      [paymentId, invitedUserId, referrerUser.id, invitedBonusDays, referrerBonusDays],
    );

    if (!insertedRows[0]) {
      const { rows: existingRows } = await client.query<{
        invited_bonus_months: number;
        referrer_bonus_months: number;
        invited_bonus_days: number;
        referrer_bonus_days: number;
        is_first_paid_conversion: boolean;
      }>(
        `SELECT invited_bonus_months, referrer_bonus_months,
                invited_bonus_days, referrer_bonus_days, is_first_paid_conversion
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
        invitedBonusDays: existingRows[0]?.invited_bonus_days ?? REFERRAL_INVITED_BONUS_DAYS,
        referrerBonusDays: existingRows[0]?.referrer_bonus_days ?? REFERRAL_TIER1_DAYS,
        isFirstPaidConversion: existingRows[0]?.is_first_paid_conversion ?? false,
        invitedUserId,
        referrerUserId: referrerUser.id,
        invitedUser: mapReferralParty(invitedUser),
        referrerUser: mapReferralParty(referrerUser),
      };
    }

    // Keep reward insert and subscription extensions in one transaction so duplicate
    // webhooks/status polls cannot ever grant the same referral bonus twice.
    await extendSubscriptionWithClientByDays(
      client,
      invitedUser.id,
      insertedRows[0].invited_bonus_days,
    );
    await extendSubscriptionWithClientByDays(
      client,
      referrerUser.id,
      insertedRows[0].referrer_bonus_days,
    );

    await client.query("COMMIT");
    return {
      applied: true,
      alreadyRewarded: false,
      paymentId,
      invitedBonusMonths: insertedRows[0].invited_bonus_months,
      referrerBonusMonths: insertedRows[0].referrer_bonus_months,
      invitedBonusDays: insertedRows[0].invited_bonus_days,
      referrerBonusDays: insertedRows[0].referrer_bonus_days,
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

/**
 * Atomically claim a payment for processing.
 * Returns true if THIS caller inserted the row (i.e. acquired the claim);
 * false if another worker had already claimed it.
 * Use as the very first step of any payment-processing flow to make duplicate
 * webhooks / poll calls truly idempotent.
 */
export async function markPaymentProcessed(paymentId: string): Promise<boolean> {
  try {
    const { rowCount } = await getPool().query(
      "INSERT INTO processed_payments (payment_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [paymentId],
    );
    return (rowCount ?? 0) > 0;
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
  supports_happ: boolean;
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

export async function getHappPanelServer(): Promise<ServerRow | null> {
  const { rows } = await getPool().query<ServerRow>(
    "SELECT * FROM servers WHERE enable = TRUE AND supports_happ = TRUE LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function updateUserHappUrl(
  userId: string,
  url: string,
): Promise<void> {
  await getPool().query(
    "UPDATE users SET happ_subscription_url = $2 WHERE id = $1",
    [userId, url],
  );
}

// ── Promo codes ──

const PROMO_LENGTH = 8;
const PROMO_RATE_LIMIT = 5;
const PROMO_WINDOW_INTERVAL = "1 hour";
const SHARED_PROMO_CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;

export function normalizeSharedPromoCode(rawCode: string): string | null {
  const code = rawCode.trim().toUpperCase();
  return SHARED_PROMO_CODE_REGEX.test(code) ? code : null;
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

export interface SharedPromoCodeResult {
  code: string;
  months: number;
  isActive: boolean;
}

export async function upsertSharedPromoCode(
  rawCode: string,
  months: 1 | 3 | 6,
): Promise<SharedPromoCodeResult | null> {
  const code = normalizeSharedPromoCode(rawCode);
  if (!code) return null;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      id: string;
      code: string;
      months: number;
      is_active: boolean;
      used_by: string | null;
    }>(
      `INSERT INTO promo_codes (code, months, kind, is_active, deactivated_at, updated_at)
       VALUES ($1, $2, 'multi_use', TRUE, NULL, NOW())
       ON CONFLICT (code) DO UPDATE
         SET months = EXCLUDED.months,
             kind = 'multi_use',
             is_active = TRUE,
             deactivated_at = NULL,
             updated_at = NOW()
       RETURNING id, code, months, is_active, used_by`,
      [code, months],
    );

    const promo = rows[0];
    if (promo.used_by) {
      await client.query(
        `INSERT INTO promo_redemptions (promo_code_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [promo.id, promo.used_by],
      );
    }

    await client.query("COMMIT");
    return {
      code: promo.code,
      months: promo.months,
      isActive: promo.is_active,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deactivateSharedPromoCode(
  rawCode: string,
): Promise<SharedPromoCodeResult | null> {
  const code = normalizeSharedPromoCode(rawCode);
  if (!code) return null;

  const { rows } = await getPool().query<{
    code: string;
    months: number;
    is_active: boolean;
  }>(
    `UPDATE promo_codes
     SET is_active = FALSE,
         deactivated_at = NOW(),
         updated_at = NOW()
     WHERE code = $1
       AND kind = 'multi_use'
     RETURNING code, months, is_active`,
    [code],
  );

  const promo = rows[0];
  if (!promo) return null;
  return {
    code: promo.code,
    months: promo.months,
    isActive: promo.is_active,
  };
}

export type PromoRedeemError =
  | "not_found"
  | "already_used"
  | "already_redeemed"
  | "inactive"
  | "rate_limited"
  | "daily_limit";

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
      kind: "single_use" | "multi_use";
      is_active: boolean;
      used_at: string | null;
    }>(
      `SELECT id, months, kind, is_active, used_at
       FROM promo_codes
       WHERE code = $1
       FOR UPDATE`,
      [code],
    );

    if (codeRows.length === 0) {
      await client.query("COMMIT");
      return { ok: false, error: "not_found" };
    }

    const promo = codeRows[0];
    if (promo.kind === "multi_use") {
      if (!promo.is_active) {
        await client.query(
          `INSERT INTO promo_attempts (user_id, code, success) VALUES ($1, $2, FALSE)`,
          [userId, code],
        );
        await client.query("COMMIT");
        return { ok: false, error: "inactive" };
      }

      const { rows: redemptionRows } = await client.query<{ id: string }>(
        `INSERT INTO promo_redemptions (promo_code_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [promo.id, userId],
      );

      if (redemptionRows.length === 0) {
        await client.query(
          `INSERT INTO promo_attempts (user_id, code, success) VALUES ($1, $2, FALSE)`,
          [userId, code],
        );
        await client.query("COMMIT");
        return { ok: false, error: "already_redeemed" };
      }
    } else {
      const { rows: dailyRows } = await client.query<{ found: string }>(
        `SELECT '1' AS found
         FROM promo_attempts
         WHERE user_id = $1
           AND success = TRUE
           AND attempted_at > NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [userId],
      );
      if (dailyRows.length > 0) {
        await client.query("ROLLBACK");
        return { ok: false, error: "daily_limit" };
      }

      if (promo.used_at !== null) {
        await client.query(
          `INSERT INTO promo_attempts (user_id, code, success) VALUES ($1, $2, FALSE)`,
          [userId, code],
        );
        await client.query("COMMIT");
        return { ok: false, error: "already_used" };
      }

      await client.query(
        `UPDATE promo_codes
         SET used_at = NOW(),
             used_by = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [userId, promo.id],
      );
    }

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
       is_notificated_d1 = FALSE,
       is_notificated_expired = FALSE,
       is_notificated_cancelled = FALSE
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

// ── Referral statistics ──

function formatReferralInviteeDisplayName(row: {
  telegram_nickname: string | null;
  login: string | null;
}): string {
  const nick = row.telegram_nickname?.trim();
  if (nick) return nick.startsWith("@") ? nick : `@${nick}`;
  const login = row.login?.trim();
  if (login) return login;
  return "Участник";
}

export interface ReferralInvitee {
  displayName: string;
  appliedAt: string;
  hasConverted: boolean;
  purchaseCount: number;
}

export interface ReferralStats {
  totalInvited: number;
  totalConverted: number;
  daysEarned: number;
  pending: number;
  currentTier: 1 | 2 | 3;
  invitees: ReferralInvitee[];
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const pool = getPool();

  const { rows: statsRows } = await pool.query<{
    total_invited: string;
    total_converted: string;
    days_earned: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::TEXT FROM (
          SELECT id FROM users WHERE referred_by_user_id = $1
          UNION
          SELECT invited_user_id FROM referral_rewards WHERE referrer_user_id = $1
        ) AS all_invitees) AS total_invited,
       (SELECT COUNT(DISTINCT invited_user_id)::TEXT FROM referral_rewards WHERE referrer_user_id = $1) AS total_converted,
       (SELECT COALESCE(SUM(COALESCE(referrer_bonus_days, 30)), 0)::TEXT FROM referral_rewards WHERE referrer_user_id = $1) AS days_earned`,
    [userId],
  );

  const totalInvited = Math.max(
    0,
    parseInt(statsRows[0]?.total_invited ?? "0", 10),
  );
  const totalConverted = Math.max(
    0,
    parseInt(statsRows[0]?.total_converted ?? "0", 10),
  );
  const daysEarned = parseInt(statsRows[0]?.days_earned ?? "0", 10);
  const pending = Math.max(0, totalInvited - totalConverted);
  const currentTier: 1 | 2 | 3 =
    totalConverted >= 11 ? 3 : totalConverted >= 4 ? 2 : 1;

  const { rows: inviteeRows } = await pool.query<{
    telegram_nickname: string | null;
    login: string | null;
    referral_applied_at: string | null;
    has_converted: boolean;
    purchase_count: string;
  }>(
    `SELECT
       inv.telegram_nickname,
       inv.login,
       inv.referral_applied_at,
       COUNT(rr.id) > 0 AS has_converted,
       COUNT(rr.id)::TEXT AS purchase_count
     FROM users inv
     LEFT JOIN referral_rewards rr
            ON rr.invited_user_id = inv.id
           AND rr.referrer_user_id = $1
     WHERE inv.referred_by_user_id = $1
        OR inv.id IN (
          SELECT invited_user_id FROM referral_rewards WHERE referrer_user_id = $1
        )
     GROUP BY inv.id, inv.telegram_nickname, inv.login, inv.referral_applied_at
     ORDER BY inv.referral_applied_at DESC NULLS LAST, inv.id
     LIMIT 20`,
    [userId],
  );

  const invitees: ReferralInvitee[] = inviteeRows.map((row) => ({
    displayName: formatReferralInviteeDisplayName(row),
    appliedAt: row.referral_applied_at ?? "",
    hasConverted: Boolean(row.has_converted),
    purchaseCount: parseInt(row.purchase_count, 10),
  }));

  return { totalInvited, totalConverted, daysEarned, pending, currentTier, invitees };
}
