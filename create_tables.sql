CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Таблица пользователей (новая схема: UUID PK, опциональный telegram_id) ──
CREATE TABLE IF NOT EXISTS users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id     BIGINT          UNIQUE,
    email           TEXT            UNIQUE,
    password_hash   TEXT,
    auth_source     TEXT            NOT NULL DEFAULT 'telegram',
    is_blocked      BOOLEAN         NOT NULL DEFAULT FALSE,
    telegram_nickname VARCHAR(255),
    expired_at      TIMESTAMP WITH TIME ZONE,
    vpn_config      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Идемпотентная миграция: поддержка старой схемы (telegram_id PK) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS vpn_config TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_nickname VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_source TEXT DEFAULT 'telegram';
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code CHAR(8);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_applied_at TIMESTAMPTZ;

DO $$
BEGIN
  -- Если telegram_id всё ещё PRIMARY KEY — мигрируем на UUID PK
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'users'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = 'telegram_id'
  ) THEN
    UPDATE users SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE users ALTER COLUMN id SET NOT NULL;
    ALTER TABLE users DROP CONSTRAINT users_pkey;
    ALTER TABLE users ADD PRIMARY KEY (id);
    ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;
  END IF;
END $$;

-- Уникальное ограничение на telegram_id (если отсутствует)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_telegram_id_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_telegram_id_unique UNIQUE (telegram_id);
  END IF;
END $$;

-- Уникальное ограничение на email (если отсутствует)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_user_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_referred_by_user_id_fkey
      FOREIGN KEY (referred_by_user_id) REFERENCES users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_referral_code_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_referral_code_unique UNIQUE (referral_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_referral_code_format_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_referral_code_format_check
      CHECK (referral_code IS NULL OR referral_code ~ '^[A-Z0-9]{8}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_not_self_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_referred_by_not_self_check
      CHECK (referred_by_user_id IS NULL OR referred_by_user_id <> id);
  END IF;
END $$;

-- auth_source NOT NULL для всех строк
UPDATE users SET auth_source = 'telegram' WHERE auth_source IS NULL;

DO $$
BEGIN
  ALTER TABLE users ALTER COLUMN auth_source SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS CHAR(8)
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  idx INTEGER;
BEGIN
  FOR idx IN 1..8 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::INTEGER, 1);
  END LOOP;
  RETURN result::CHAR(8);
END;
$$;

CREATE OR REPLACE FUNCTION assign_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Рефкод для веб-регистрации не выдаём на уровне БД (только Mini App / Telegram-логика в приложении).
  IF NEW.auth_source = 'web' THEN
    IF NEW.referral_code IS NOT NULL THEN
      NEW.referral_code := UPPER(BTRIM(NEW.referral_code::TEXT))::CHAR(8);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  ELSE
    NEW.referral_code := UPPER(BTRIM(NEW.referral_code));
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'users_assign_referral_code_before_insert'
      AND tgrelid = 'users'::regclass
  ) THEN
    CREATE TRIGGER users_assign_referral_code_before_insert
      BEFORE INSERT ON users
      FOR EACH ROW
      EXECUTE FUNCTION assign_user_referral_code();
  END IF;
END $$;

DO $$
DECLARE
  target_user_id UUID;
  generated_code CHAR(8);
BEGIN
  FOR target_user_id IN
    SELECT id FROM users WHERE referral_code IS NULL AND auth_source <> 'web'
  LOOP
    LOOP
      generated_code := generate_referral_code();
      BEGIN
        UPDATE users
        SET referral_code = generated_code
        WHERE id = target_user_id
          AND referral_code IS NULL;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Retry on the rare code collision to keep the migration idempotent.
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

-- ── Напоминания об окончании подписки (cron в боте, 11:00 Europe/Moscow) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_notificated_d3 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_notificated_d1 BOOLEAN NOT NULL DEFAULT FALSE;
-- Уведомление в момент истечения (грейс 2 дня на продление)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_notificated_expired BOOLEAN NOT NULL DEFAULT FALSE;
-- Уведомление об окончательной отмене (спустя 2 дня грейса без оплаты)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_notificated_cancelled BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Идемпотентность платежей (защита от дублей webhook) ──
CREATE TABLE IF NOT EXISTS processed_payments (
    payment_id  TEXT                        PRIMARY KEY,
    processed_at TIMESTAMP WITH TIME ZONE   NOT NULL DEFAULT NOW()
);
-- ── Промокоды ──
CREATE TABLE IF NOT EXISTS promo_codes (
    id          UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    code        CHAR(8)                  NOT NULL UNIQUE,
    months      SMALLINT                 NOT NULL CHECK (months IN (1, 3, 6)),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    used_at     TIMESTAMP WITH TIME ZONE,
    used_by     UUID                     REFERENCES users(id)
);

-- Попытки ввода промокодов (rate-limit + аудит)
CREATE TABLE IF NOT EXISTS promo_attempts (
    id           UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID                     NOT NULL REFERENCES users(id),
    code         TEXT                     NOT NULL,
    success      BOOLEAN                  NOT NULL DEFAULT FALSE,
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_attempts_user_window
    ON promo_attempts (user_id, attempted_at)
    WHERE success = FALSE;

CREATE TABLE IF NOT EXISTS referral_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT NOT NULL,
    invited_user_id UUID NOT NULL REFERENCES users(id),
    referrer_user_id UUID NOT NULL REFERENCES users(id),
    invited_bonus_months SMALLINT NOT NULL DEFAULT 1,
    referrer_bonus_months SMALLINT NOT NULL DEFAULT 1,
    is_first_paid_conversion BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_rewards_payment_id_unique'
  ) THEN
    ALTER TABLE referral_rewards
      ADD CONSTRAINT referral_rewards_payment_id_unique UNIQUE (payment_id);
  END IF;
END $$;

-- ── Таблица серверов ──
CREATE TABLE IF NOT EXISTS servers (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name_server         VARCHAR(255),
    location            VARCHAR(255),
    ip_address          VARCHAR(45),
    port_api            VARCHAR(10),
    server_id           VARCHAR(255),
    is_vip              BOOLEAN         DEFAULT TRUE,
    enable              BOOLEAN         DEFAULT TRUE,
    domain_server_name  VARCHAR(255),
    user_count          INTEGER         DEFAULT 0
);
