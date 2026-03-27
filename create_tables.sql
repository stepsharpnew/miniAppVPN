CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    telegram_id     BIGINT          PRIMARY KEY,
    is_blocked      BOOLEAN         NOT NULL DEFAULT FALSE,
    telegram_nickname VARCHAR(255),
    expired_at      TIMESTAMP WITH TIME ZONE,
    vpn_config      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS vpn_config TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_nickname VARCHAR(255);

-- Таблица серверов
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
