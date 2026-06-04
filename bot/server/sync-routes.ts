import bcrypt from "bcryptjs";
import express from "express";
import {
  createTelegramUserIfMissing,
  getUserByLogin,
  getUserByTelegramId,
  linkLoginToTelegramUser,
  mergeAccounts,
  updatePasswordHash,
} from "./db";
import {
  SALT_ROUNDS,
  generateTokens,
  getUserPasswordVersion,
  normalizeLogin,
  validateLogin,
} from "./web-auth";
import { authRateLimiter } from "./security";

async function tokensForUser(userId: string) {
  const pv = await getUserPasswordVersion(userId);
  return generateTokens(userId, pv);
}
const MIN_PASSWORD_LENGTH = 8;

interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

function getTgUser(req: express.Request): TelegramUser {
  return (req as any).tgUser;
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символов`;
  }
  if (password.length > 128) {
    return "Пароль слишком длинный";
  }
  return null;
}

/**
 * Mounts sync routes under /api/sync/*.
 * All routes require Telegram initData auth (the `auth` middleware from api.ts).
 *
 * Доверие:
 *  - Владение Telegram-аккаунтом доказывается подписанным initData (через `auth` middleware).
 *  - Владение веб-аккаунтом доказывается знанием пароля (для login-веток).
 * OTP/email больше не нужны.
 */
export function mountSyncRoutes(
  app: express.Express,
  auth: express.RequestHandler,
) {
  // Текущее состояние привязки для текущего Telegram-юзера.
  app.get("/api/sync/status", auth, async (req, res) => {
    const tg = getTgUser(req);
    try {
      const user = await getUserByTelegramId(tg.id);
      if (!user) {
        res.json({ synced: false, login: null });
        return;
      }
      res.json({
        synced: !!user.login,
        login: user.login ?? null,
      });
    } catch (err) {
      console.error("Sync status error:", err);
      res.status(500).json({ error: "Внутренняя ошибка" });
    }
  });

  // Регистрация веб-аккаунта изнутри Mini App: создаём логин/пароль и привязываем к TG.
  app.post("/api/sync/register", auth, authRateLimiter, async (req, res) => {
    const tg = getTgUser(req);
    const { login, password } = req.body ?? {};

    if (!login || !password) {
      res.status(400).json({ error: "Логин и пароль обязательны" });
      return;
    }

    const loginErr = validateLogin(login);
    if (loginErr) {
      res.status(400).json({ error: loginErr });
      return;
    }

    const pwErr = validatePassword(password);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    const normalizedLogin = normalizeLogin(login);

    try {
      const tgUser = await getUserByTelegramId(tg.id);
      if (tgUser?.login) {
        res.status(409).json({
          error: "У вашего Telegram-аккаунта уже есть привязанный логин",
        });
        return;
      }

      const existing = await getUserByLogin(normalizedLogin);
      if (existing) {
        res.status(409).json({ error: "Этот логин уже занят" });
        return;
      }

      await createTelegramUserIfMissing(tg.id, tg.username ?? null);

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await linkLoginToTelegramUser(tg.id, normalizedLogin, hash);

      if (!user) {
        res.status(404).json({ error: "Telegram-аккаунт не найден" });
        return;
      }

      const tokens = await tokensForUser(user.id);
      res.json({ ok: true, ...tokens });
    } catch (err) {
      console.error("Sync register error:", err);
      res.status(500).json({ error: "Не удалось завершить регистрацию" });
    }
  });

  // Привязка существующего веб-аккаунта к текущему Telegram-юзеру.
  // Знание пароля = доказательство владения веб-аккаунтом, initData = доказательство TG.
  app.post("/api/sync/link", auth, authRateLimiter, async (req, res) => {
    const tg = getTgUser(req);
    const { login, password } = req.body ?? {};

    if (!login || !password) {
      res.status(400).json({ error: "Логин и пароль обязательны" });
      return;
    }

    const normalizedLogin = normalizeLogin(login);

    try {
      const webUser = await getUserByLogin(normalizedLogin);
      if (!webUser || !webUser.password_hash) {
        res.status(401).json({ error: "Неверный логин или пароль" });
        return;
      }

      if (webUser.telegram_id && webUser.telegram_id !== tg.id) {
        res.status(409).json({
          error: "Этот логин уже привязан к другому Telegram-аккаунту",
        });
        return;
      }

      // Уже привязан к этому же TG — просто отдаём токены.
      if (webUser.telegram_id === tg.id) {
        const tokens = await tokensForUser(webUser.id);
        res.json({ ok: true, ...tokens });
        return;
      }

      const valid = await bcrypt.compare(password, webUser.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Неверный пароль" });
        return;
      }

      const tgUser = await getUserByTelegramId(tg.id);
      const ensuredTgUser =
        tgUser ?? (await createTelegramUserIfMissing(tg.id, tg.username ?? null));

      const merged = await mergeAccounts(
        ensuredTgUser.id,
        webUser.id,
        tg.id,
        tg.username ?? null,
      );

      const tokens = await tokensForUser(merged.id);
      res.json({ ok: true, ...tokens });
    } catch (err) {
      console.error("Sync link error:", err);
      res.status(500).json({ error: "Не удалось завершить привязку" });
    }
  });

  // Установка/смена пароля для уже привязанного веб-аккаунта изнутри Mini App.
  // Это и «сменить пароль», и «забыл пароль» — initData служит доказательством владения.
  app.post("/api/sync/set-password", auth, async (req, res) => {
    const tg = getTgUser(req);
    const { password } = req.body ?? {};

    if (!password) {
      res.status(400).json({ error: "Пароль обязателен" });
      return;
    }

    const pwErr = validatePassword(password);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    try {
      const user = await getUserByTelegramId(tg.id);
      if (!user) {
        res.status(404).json({ error: "Telegram-аккаунт не найден" });
        return;
      }
      if (!user.login) {
        res.status(400).json({
          error: "Сначала привяжите логин — введите его при регистрации в разделе синхронизации",
        });
        return;
      }

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await updatePasswordHash(user.id, hash);

      const tokens = await tokensForUser(user.id);
      res.json({ ok: true, ...tokens });
    } catch (err) {
      console.error("Sync set-password error:", err);
      res.status(500).json({ error: "Не удалось обновить пароль" });
    }
  });
}
