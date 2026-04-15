import bcrypt from "bcryptjs";
import express from "express";
import {
  createTelegramUserIfMissing,
  getUserByEmail,
  getUserByTelegramId,
  linkEmailToTelegramUser,
  mergeAccounts,
} from "./db";
import { sendOtpEmail } from "./email-service";
import { createOtp, verifyOtp, consumeVerifyToken } from "./otp-store";
import { generateTokens } from "./web-auth";

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

function getTgUser(req: express.Request): TelegramUser {
  return (req as any).tgUser;
}

/**
 * Mounts sync routes under /api/sync/*.
 * All routes require Telegram initData auth (the `auth` middleware from api.ts).
 */
export function mountSyncRoutes(
  app: express.Express,
  auth: express.RequestHandler,
) {
  // Check current sync status for the telegram user
  app.get("/api/sync/status", auth, async (req, res) => {
    const tg = getTgUser(req);
    try {
      const user = await getUserByTelegramId(tg.id);
      if (!user) {
        res.json({ synced: false, email: null });
        return;
      }
      res.json({
        synced: !!user.email,
        email: user.email ?? null,
      });
    } catch (err) {
      console.error("Sync status error:", err);
      res.status(500).json({ error: "Внутренняя ошибка" });
    }
  });

  // Step 1: Send OTP code to email
  app.post("/api/sync/send-code", auth, async (req, res) => {
    const tg = getTgUser(req);
    const { email } = req.body ?? {};

    if (!email || !validateEmail(email)) {
      res.status(400).json({ error: "Некорректный email" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const tgUser = await getUserByTelegramId(tg.id);
      if (tgUser?.email) {
        res.status(409).json({
          error: "У вашего Telegram-аккаунта уже привязана почта",
        });
        return;
      }

      const existingEmail = await getUserByEmail(normalizedEmail);
      if (existingEmail?.telegram_id && existingEmail.telegram_id !== tg.id) {
        res.status(409).json({
          error: "Этот email уже привязан к другому Telegram-аккаунту",
        });
        return;
      }

      const result = createOtp(normalizedEmail, "sync", tg.id);
      if ("error" in result) {
        res.status(429).json({ error: result.error });
        return;
      }

      await sendOtpEmail(normalizedEmail, result.code);

      res.json({ ok: true, message: "Код отправлен на почту" });
    } catch (err) {
      console.error("Sync send-code error:", err);
      res.status(500).json({ error: "Не удалось отправить код" });
    }
  });

  // Step 2: Verify OTP code
  app.post("/api/sync/verify-code", auth, async (req, res) => {
    const { email, code } = req.body ?? {};

    if (!email || !code) {
      res.status(400).json({ error: "Email и код обязательны" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const result = verifyOtp(normalizedEmail, "sync", code.trim());
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    try {
      const existingUser = await getUserByEmail(normalizedEmail);
      const needsPassword = !existingUser;

      res.json({
        verified: true,
        verifyToken: result.verifyToken,
        mode: needsPassword ? "register" : "login",
      });
    } catch (err) {
      console.error("Sync verify-code error:", err);
      res.status(500).json({ error: "Внутренняя ошибка" });
    }
  });

  // Step 3a: Set password (registration — email not in DB)
  app.post("/api/sync/register", auth, async (req, res) => {
    const tg = getTgUser(req);
    const { email, password, verifyToken } = req.body ?? {};

    if (!email || !password || !verifyToken) {
      res.status(400).json({ error: "Все поля обязательны" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символов`,
      });
      return;
    }
    if (password.length > 128) {
      res.status(400).json({ error: "Пароль слишком длинный" });
      return;
    }

    try {
      const existing = await getUserByEmail(normalizedEmail);
      if (existing) {
        res.status(409).json({ error: "Этот email уже зарегистрирован" });
        return;
      }

      await createTelegramUserIfMissing(tg.id, tg.username ?? null);

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await linkEmailToTelegramUser(tg.id, normalizedEmail, hash);

      if (!user) {
        res.status(404).json({ error: "Telegram-аккаунт не найден" });
        return;
      }

      if (!consumeVerifyToken(normalizedEmail, "sync", verifyToken)) {
        res.status(403).json({ error: "Токен недействителен. Пройдите верификацию заново" });
        return;
      }

      const tokens = generateTokens(user.id);
      res.json({ ok: true, ...tokens });
    } catch (err) {
      console.error("Sync register error:", err);
      res.status(500).json({ error: "Не удалось завершить регистрацию" });
    }
  });

  // Step 3b: Login (email exists in DB — enter web password to merge)
  app.post("/api/sync/login", auth, async (req, res) => {
    const tg = getTgUser(req);
    const { email, password, verifyToken } = req.body ?? {};

    if (!email || !password || !verifyToken) {
      res.status(400).json({ error: "Все поля обязательны" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const webUser = await getUserByEmail(normalizedEmail);
      if (!webUser || !webUser.password_hash) {
        res.status(401).json({ error: "Неверный email или пароль" });
        return;
      }

      if (webUser.telegram_id && webUser.telegram_id !== tg.id) {
        res.status(409).json({
          error: "Этот email уже привязан к другому Telegram-аккаунту",
        });
        return;
      }

      if (webUser.telegram_id === tg.id) {
        const tokens = generateTokens(webUser.id);
        res.json({ ok: true, ...tokens });
        return;
      }

      const valid = await bcrypt.compare(password, webUser.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Неверный пароль" });
        return;
      }

      const tgUser = await getUserByTelegramId(tg.id);
      const ensuredTgUser = tgUser ?? await createTelegramUserIfMissing(tg.id, tg.username ?? null);

      if (!consumeVerifyToken(normalizedEmail, "sync", verifyToken)) {
        res.status(403).json({ error: "Токен недействителен. Пройдите верификацию заново" });
        return;
      }

      const merged = await mergeAccounts(
        ensuredTgUser.id,
        webUser.id,
        tg.id,
        tg.username ?? null,
      );

      const tokens = generateTokens(merged.id);
      res.json({ ok: true, ...tokens });
    } catch (err) {
      console.error("Sync login error:", err);
      res.status(500).json({ error: "Не удалось завершить привязку" });
    }
  });
}
