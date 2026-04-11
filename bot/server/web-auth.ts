import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import express from "express";
import {
  getUserByEmail,
  getUserById,
  createWebUser,
  getPool,
  type UserRow,
} from "./db";
import { addMessage, getMessages, hasMessages } from "./chat-store";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";
const SALT_ROUNDS = 10;

function getSecrets() {
  const secret = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
  const refreshSecret = process.env.JWT_REFRESH_SECRET || secret + "-refresh";
  return { secret, refreshSecret };
}

export function generateTokens(userId: string) {
  const { secret, refreshSecret } = getSecrets();
  const accessToken = jwt.sign({ sub: userId }, secret, { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign({ sub: userId }, refreshSecret, { expiresIn: REFRESH_TTL });
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): string | null {
  try {
    const { secret } = getSecrets();
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    return payload.sub as string;
  } catch {
    return null;
  }
}

function verifyRefreshToken(token: string): string | null {
  try {
    const { refreshSecret } = getSecrets();
    const payload = jwt.verify(token, refreshSecret) as jwt.JwtPayload;
    return payload.sub as string;
  } catch {
    return null;
  }
}

export function webAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = verifyAccessToken(header.slice(7));
  if (!userId) {
    res.status(401).json({ error: "Token expired or invalid" });
    return;
  }
  (req as any).webUserId = userId;
  next();
}

export function getWebUserId(req: express.Request): string {
  return (req as any).webUserId;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
  if (password.length < 6) return "Пароль должен быть минимум 6 символов";
  if (password.length > 128) return "Пароль слишком длинный";
  return null;
}

export function mountWebAuthRoutes(app: express.Express) {
  app.post("/api/web/register", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "Email и пароль обязательны" });
      return;
    }
    if (!validateEmail(email)) {
      res.status(400).json({ error: "Некорректный email" });
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    const existing = await getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      res.status(409).json({ error: "Пользователь с таким email уже существует" });
      return;
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createWebUser(email.toLowerCase().trim(), hash);
    const tokens = generateTokens(user.id);

    res.json({
      user: sanitizeUser(user),
      ...tokens,
    });
  });

  app.post("/api/web/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "Email и пароль обязательны" });
      return;
    }

    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user || !user.password_hash) {
      res.status(401).json({ error: "Неверный email или пароль" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Неверный email или пароль" });
      return;
    }

    const tokens = generateTokens(user.id);
    res.json({
      user: sanitizeUser(user),
      ...tokens,
    });
  });

  app.post("/api/web/refresh", async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken обязателен" });
      return;
    }

    const userId = verifyRefreshToken(refreshToken);
    if (!userId) {
      res.status(401).json({ error: "Refresh token невалиден или истёк" });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(401).json({ error: "Пользователь не найден" });
      return;
    }

    const tokens = generateTokens(user.id);
    res.json({
      user: sanitizeUser(user),
      ...tokens,
    });
  });

  app.get("/api/web/me", webAuth, async (req, res) => {
    const user = await getUserById(getWebUserId(req));
    if (!user) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.post("/api/web/change-password", webAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Оба пароля обязательны" });
      return;
    }
    const pwErr = validatePassword(newPassword);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    const userId = getWebUserId(req);
    const user = await getUserById(userId);
    if (!user || !user.password_hash) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Текущий пароль неверный" });
      return;
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await getPool().query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);

    res.json({ ok: true });
  });

  // ── Web subscription status ──
  app.get("/api/web/subscription", webAuth, async (req, res) => {
    const user = await getUserById(getWebUserId(req));
    if (!user) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }
    const expiredAt = user.expired_at ? new Date(user.expired_at) : null;
    const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
    res.json({
      active,
      expired_at: user.expired_at,
      is_blocked: user.is_blocked,
      config: active ? user.vpn_config : null,
      created_at: user.created_at,
      email: user.email,
    });
  });

  // ── Web support chat ──

  app.get("/api/web/support/messages", webAuth, (req: express.Request, res: express.Response) => {
    const userId = getWebUserId(req);
    const after = req.query.after ? Number(req.query.after) : undefined;
    res.json({ messages: getMessages(userId, after) });
  });

  app.post("/api/web/support/send", webAuth, async (req: express.Request, res: express.Response) => {
    const userId = getWebUserId(req);
    const { text } = req.body;
    if (!text?.trim()) {
      res.status(400).json({ error: "Empty message" });
      return;
    }

    const raw = process.env.ADMIN_CHAT_ID_SUPPORT;
    if (!raw) {
      res.status(503).json({ error: "Support unavailable" });
      return;
    }

    const user = await getUserById(userId);
    const userName = user?.email ?? "Веб-пользователь";
    const isNew = !hasMessages(userId);

    const message = addMessage(userId, {
      from: "user",
      type: "text",
      text: text.trim(),
    });

    res.json({ message });
  });
}

function sanitizeUser(user: UserRow) {
  const expiredAt = user.expired_at ? new Date(user.expired_at) : null;
  const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
  return {
    id: user.id,
    email: user.email,
    auth_source: user.auth_source,
    active,
    expired_at: user.expired_at,
    is_blocked: user.is_blocked,
    created_at: user.created_at,
    has_config: !!user.vpn_config && active,
  };
}
