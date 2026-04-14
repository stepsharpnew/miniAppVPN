import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import express from "express";
import { type Api } from "grammy";
import {
  getUserByEmail,
  getUserById,
  createWebUser,
  getPool,
  extendSubscriptionById,
  getRandomEnabledServer,
  getAllEnabledServers,
  incrementServerUserCount,
  type UserRow,
  type ServerRow,
} from "./db";
import { addMessage, getMessages, hasMessages } from "./chat-store";
import { getConfig, saveConfig } from "./config-store";
import { provisionVpnClient, extendVpnClient } from "./vpn";
import {
  getPendingPayment,
  markPaymentCanceled,
  markPaymentSucceeded,
  savePendingPayment,
} from "./payment-store";
import { PRICING, type PaymentMetadata } from "../shared/plans";
import { BRAND_NAME, PAYMENT_ADMIN_NOTIFY } from "../shared/texts";
import { resolveAdminChat } from "./store";

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

function getServerBaseUrl(server: ServerRow): string {
  const raw = server.domain_server_name;
  if (!raw) throw new Error(`Server ${server.server_id} has no domain_server_name`);
  return raw.replace(/\/+$/, "");
}

// ── Web payment processing (shared between polling and webhook) ──

export async function processWebPaymentFromWebhook(paymentId: string, api?: Api): Promise<void> {
  const pending = getPendingPayment(paymentId);
  if (!pending || pending.status === "succeeded") return;

  pending.status = "succeeded";

  const userId = pending.userId as string;
  const user = await getUserById(userId);
  const clientName = user?.email?.replace(/[^a-zA-Z0-9_-]/g, "_") ?? `web_${userId.slice(0, 8)}`;

  let config = pending.config ?? getConfig(userId) ?? undefined;
  let provisionOk = !!config;

  if (!config && user?.vpn_config) {
    config = user.vpn_config;
    provisionOk = true;
    try {
      const servers = await getAllEnabledServers();
      let extended = false;
      for (const srv of servers) {
        try {
          await extendVpnClient(clientName, pending.durationCode, getServerBaseUrl(srv));
          extended = true;
          break;
        } catch { /* next server */ }
      }
      if (!extended) console.error("VPN extend (web renewal): client not found");
    } catch (err) {
      console.error("VPN extend (web renewal) failed:", err);
    }
  }

  if (!config) {
    try {
      const server = await getRandomEnabledServer();
      if (!server?.server_id) throw new Error("No enabled VPN servers");
      const baseUrl = getServerBaseUrl(server);
      config = await provisionVpnClient(clientName, pending.durationCode, server.server_id, baseUrl);
      provisionOk = true;
      saveConfig(userId, config);
      await incrementServerUserCount(server.server_id).catch(() => {});
    } catch (err) {
      console.error("VPN provisioning (web) failed:", err);
    }
  }

  markPaymentSucceeded(paymentId, config);

  try {
    await extendSubscriptionById(userId, pending.months, config);
  } catch (err) {
    console.error("DB upsert after web payment failed:", err);
  }

  const plan = PRICING.find((p) => p.months === pending.months);
  const planLabel = plan?.label ?? `${pending.months} мес.`;
  const amountStr = `${pending.amount.toFixed(0)}₽`;
  const userName = user?.email ?? pending.firstName ?? "Веб-пользователь";
  const userTag = user?.email ? `email:${user.email}` : "без email";
  const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY;
  if (api && rawBuyChat) {
    const admin = resolveAdminChat(rawBuyChat);
    try {
      await api.sendMessage(
        admin.chatId,
        PAYMENT_ADMIN_NOTIFY(
          userName,
          userTag,
          userId,
          planLabel,
          amountStr,
          provisionOk,
          pending.isRenewal,
        ),
        {
          parse_mode: "HTML",
          ...(admin.topicId !== undefined ? { message_thread_id: admin.topicId } : {}),
        },
      );
    } catch {
      /* admin notification best-effort */
    }
  }
}

// ── Mount all web routes ──

export function mountWebAuthRoutes(app: express.Express, api?: Api) {
  // ════════════════════════════════════════════════════════════
  //  Auth: register, login, refresh, me, change-password
  // ════════════════════════════════════════════════════════════

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

    res.json({ user: sanitizeUser(user), ...tokens });
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
    res.json({ user: sanitizeUser(user), ...tokens });
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
    res.json({ user: sanitizeUser(user), ...tokens });
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

  // ════════════════════════════════════════════════════════════
  //  Subscription status + VPN config download
  // ════════════════════════════════════════════════════════════

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

  app.get("/api/web/config/download", webAuth, async (req, res) => {
    const user = await getUserById(getWebUserId(req));
    if (!user) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }
    const expiredAt = user.expired_at ? new Date(user.expired_at) : null;
    const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
    if (!active || !user.vpn_config) {
      res.status(404).json({ error: "Конфиг недоступен" });
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", "attachment; filename=\"meme-vpn.conf\"");
    res.send(user.vpn_config);
  });

  // ════════════════════════════════════════════════════════════
  //  Payments (YooKassa)
  // ════════════════════════════════════════════════════════════

  const shopId = (process.env.MERCHANT_SHOP_ID ?? "").trim();
  const secretKey = (process.env.MERCHANT_KEY ?? "").trim();
  const yookassaAuth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");

  app.post("/api/web/payments/create", webAuth, async (req, res) => {
    if (!shopId || !secretKey) {
      res.status(503).json({ error: "Payments not configured" });
      return;
    }

    const { months } = req.body ?? {};
    const plan = PRICING.find((p) => p.months === months);
    if (!plan) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }

    const userId = getWebUserId(req);
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    let isRenewal = false;
    if (user.expired_at) {
      isRenewal = new Date(user.expired_at).getTime() > Date.now();
    }

    const idempotenceKey = crypto.randomUUID();

    const metadata: PaymentMetadata = {
      telegram_user_id: userId,
      username: user.email ?? "",
      first_name: user.email ?? "Веб-пользователь",
      months: String(plan.months),
      duration_code: plan.durationCode,
      is_renewal: isRenewal ? "1" : "0",
    };

    const siteOrigin = (process.env.WEB_SITE_URL ?? "").trim();
    const returnUrl = siteOrigin
      ? `${siteOrigin}?payment_return=1`
      : "https://example.com";

    const description = isRenewal
      ? `${BRAND_NAME} — Продление: ${plan.label}`
      : `${BRAND_NAME} — ${plan.label}`;

    const body = JSON.stringify({
      amount: { value: plan.price.toFixed(2), currency: "RUB" },
      confirmation: { type: "redirect", return_url: returnUrl },
      capture: true,
      description,
      metadata,
    });

    try {
      const ykRes = await fetch("https://api.yookassa.ru/v3/payments", {
        method: "POST",
        headers: {
          Authorization: `Basic ${yookassaAuth}`,
          "Idempotence-Key": idempotenceKey,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!ykRes.ok) {
        const text = await ykRes.text();
        console.error("YooKassa web create-payment error:", ykRes.status, text);
        res.status(502).json({ error: "Payment provider error" });
        return;
      }

      const payment = await ykRes.json();
      const confirmationUrl: string = payment.confirmation?.confirmation_url;
      if (!confirmationUrl) {
        console.error("YooKassa web response missing confirmation_url:", payment);
        res.status(502).json({ error: "Invalid payment provider response" });
        return;
      }

      savePendingPayment({
        paymentId: payment.id,
        userId,
        username: user.email ?? "",
        firstName: user.email ?? "Веб-пользователь",
        months: plan.months,
        durationCode: plan.durationCode,
        amount: plan.price,
        status: "pending",
        isRenewal,
        source: "web",
      });

      res.json({ confirmationUrl, paymentId: payment.id });
    } catch (err) {
      console.error("YooKassa web create-payment fetch error:", err);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  app.get("/api/web/payments/status/:paymentId", webAuth, async (req, res) => {
    const raw = req.params.paymentId;
    const paymentId = typeof raw === "string" ? raw : raw?.[0];
    if (!paymentId) {
      res.status(400).json({ error: "Missing paymentId" });
      return;
    }

    const pending = getPendingPayment(paymentId);
    if (!pending) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    const userId = getWebUserId(req);
    if (pending.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (pending.status === "pending" && shopId && secretKey) {
      try {
        const ykRes = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
          headers: { Authorization: `Basic ${yookassaAuth}` },
        });
        if (ykRes.ok) {
          const ykPayment = await ykRes.json();
          if (ykPayment.status === "succeeded") {
            await processWebPaymentFromWebhook(paymentId, api);
          } else if (ykPayment.status === "canceled") {
            markPaymentCanceled(paymentId);
          }
        }
      } catch (e) {
        console.error("YooKassa web status check error:", e);
      }
    }

    const updated = getPendingPayment(paymentId);
    res.json({
      status: updated?.status ?? pending.status,
      config: updated?.config ?? pending.config ?? null,
    });
  });

  // ════════════════════════════════════════════════════════════
  //  Support chat
  // ════════════════════════════════════════════════════════════

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
