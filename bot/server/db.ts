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
  telegram_id: number;
  is_blocked: boolean;
  is_vip: boolean;
  expired_at: string | null;
  vpn_config: string | null;
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
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (telegram_id, expired_at, vpn_config)
     VALUES ($1, NOW() + make_interval(months => $2), $3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET expired_at = CASE
         WHEN users.expired_at IS NOT NULL AND users.expired_at > NOW()
           THEN users.expired_at + make_interval(months => $2)
           ELSE NOW() + make_interval(months => $2)
       END,
       vpn_config = COALESCE($3, users.vpn_config)
     RETURNING *`,
    [telegramId, months, vpnConfig ?? null],
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
