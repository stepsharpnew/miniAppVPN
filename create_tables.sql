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
  ALTER TABLE users ADD CONSTRAINT users_telegram_id_unique UNIQUE (telegram_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Уникальное ограничение на email (если отсутствует)
DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- auth_source NOT NULL для всех строк
UPDATE users SET auth_source = 'telegram' WHERE auth_source IS NULL;

DO $$
BEGIN
  ALTER TABLE users ALTER COLUMN auth_source SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
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
