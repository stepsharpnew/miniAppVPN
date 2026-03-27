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
  created_at: string;
}

/**
 * Create user if missing, then extend subscription by `months`.
 * If the user already has an active subscription (expired_at > now),
 * the new period is added on top; otherwise it starts from now.
 */
export async function upsertUserSubscription(
  telegramId: number,
  months: number,
): Promise<UserRow> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (telegram_id, expired_at)
     VALUES ($1, NOW() + make_interval(months => $2))
     ON CONFLICT (telegram_id) DO UPDATE
       SET expired_at = CASE
         WHEN users.expired_at IS NOT NULL AND users.expired_at > NOW()
           THEN users.expired_at + make_interval(months => $2)
           ELSE NOW() + make_interval(months => $2)
       END
     RETURNING *`,
    [telegramId, months],
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
