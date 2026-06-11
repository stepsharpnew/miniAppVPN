import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import express from "express";
import { type Api } from "grammy";
import {
  applyReferralCode,
  applyReferralRewardsForPayment,
  getUserByLogin,
  getUserById,
  createWebUser,
  getPool,
  extendSubscriptionById,
  getRandomEnabledServer,
  getAllEnabledServers,
  getUserReferralInfoForWeb,
  getHappPanelServer,
  incrementServerUserCount,
  markPaymentProcessed,
  updateUserHappUrl,
  type UserRow,
  type ServerRow,
} from "./db";
import {
  getSupportMessages,
  resolveSupportActor,
  sendSupportTextMessage,
} from "./support-service";
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
import { sendReferralRewardNotifications } from "./referral-notifications";
import { sendGiftPromoAdminNotification } from "./promo-notifications";
import {
  getWebClientName,
  reissueVpnConfig,
  syncVpnForPromoRedemption,
  syncVpnForReferralReward,
} from "./promo-vpn";
import { extendHapp, provisionHapp } from "./happ";
import { redeemUnifiedCode, type UnifiedRedeemError } from "./redeem-code";
import {
  authRateLimiter,
  isValidPaymentId,
  paymentCreateRateLimiter,
  promoRateLimiter,
} from "./security";
import { getServerBaseUrl } from "./panel-url";
import {
  claimLazyHappBackfill,
  releaseLazyHappBackfill,
  recordLazyHappBackfillFailure,
  recordLazyHappBackfillSuccess,
} from "./happ-backfill";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";
export const SALT_ROUNDS = 12;

// Логин: case-insensitive, 3–64 символа, латиница/цифры/точка/подчёркивание/дефис/собака.
// `@` оставляем разрешённым, чтобы не отбраковать существующих пользователей,
// у которых login = их прежний email.
const LOGIN_REGEX = /^[A-Za-z0-9._@-]{3,64}$/;

function getSecrets(): { secret: string; refreshSecret: string } {
  const secret = process.env.JWT_SECRET?.trim();
  const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!secret || secret.length < 32) {
      throw new Error("JWT_SECRET must be set (min 32 chars) in production");
    }
    if (!refreshSecret || refreshSecret.length < 32) {
      throw new Error("JWT_REFRESH_SECRET must be set (min 32 chars) in production");
    }
    return { secret, refreshSecret };
  }

  const devSecret = secret || "dev-jwt-secret-change-me-in-production";
  const devRefresh = refreshSecret || `${devSecret}-refresh`;
  return { secret: devSecret, refreshSecret: devRefresh };
}

export function generateTokens(userId: string, passwordVersion = 0) {
  const { secret, refreshSecret } = getSecrets();
  const accessToken = jwt.sign({ sub: userId, pv: passwordVersion }, secret, {
    expiresIn: ACCESS_TTL,
  });
  const refreshToken = jwt.sign({ sub: userId, pv: passwordVersion }, refreshSecret, {
    expiresIn: REFRESH_TTL,
  });
  return { accessToken, refreshToken };
}

export async function getUserPasswordVersion(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ password_version: number }>(
    "SELECT COALESCE(password_version, 0)::int AS password_version FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.password_version ?? 0;
}

export function verifyAccessToken(token: string): string | null {
  try {
    const { secret } = getSecrets();
    const payload = jwt.verify(token, secret) as jwt.JwtPayload & { pv?: number };
    return payload.sub as string;
  } catch {
    return null;
  }
}

/** Проверяет access-токен и что password_version в JWT совпадает с БД. */
export async function verifyAccessTokenStrict(token: string): Promise<string | null> {
  try {
    const { secret } = getSecrets();
    const payload = jwt.verify(token, secret) as jwt.JwtPayload & { pv?: number };
    const userId = payload.sub as string;
    if (!userId) return null;
    const dbPv = await getUserPasswordVersion(userId);
    const tokenPv = typeof payload.pv === "number" ? payload.pv : 0;
    if (tokenPv !== dbPv) return null;
    return userId;
  } catch {
    return null;
  }
}

function verifyRefreshToken(token: string): { userId: string; pv: number } | null {
  try {
    const { refreshSecret } = getSecrets();
    const payload = jwt.verify(token, refreshSecret) as jwt.JwtPayload & { pv?: number };
    const userId = payload.sub as string;
    if (!userId) return null;
    return { userId, pv: typeof payload.pv === "number" ? payload.pv : 0 };
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
  void verifyAccessTokenStrict(header.slice(7))
    .then((userId) => {
      if (!userId) {
        res.status(401).json({ error: "Token expired or invalid" });
        return;
      }
      (req as any).webUserId = userId;
      next();
    })
    .catch(() => {
      res.status(401).json({ error: "Token expired or invalid" });
    });
}

export function getWebUserId(req: express.Request): string {
  return (req as any).webUserId;
}

export function validateLogin(login: string): string | null {
  if (!LOGIN_REGEX.test(login)) {
    return "Логин: 3–64 символа, латиница/цифры и . _ - @";
  }
  return null;
}

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Пароль должен быть минимум 8 символов";
  if (password.length > 128) return "Пароль слишком длинный";
  return null;
}

function getHappDurationCodeForExpiry(expiredAt: Date | null): string {
  const daysLeft = expiredAt
    ? Math.max(1, Math.ceil((expiredAt.getTime() - Date.now()) / 86_400_000))
    : 30;
  if (daysLeft > 180) return "6m";
  if (daysLeft > 60) return "3m";
  if (daysLeft > 25) return "1m";
  return `${daysLeft}d`;
}

function mapReferralApplyError(error?: string): { status: number; message: string } {
  switch (error) {
    case "empty":
      return { status: 400, message: "Промокод обязателен" };
    case "not_found":
      return { status: 400, message: "Промокод не найден" };
    case "self_referral":
      return { status: 400, message: "Нельзя применить собственный код" };
    case "already_applied":
      return { status: 400, message: "Реферальный код уже применён ранее" };
    default:
      return { status: 500, message: "Не удалось применить промокод" };
  }
}

function mapPromoRedeemError(error?: string): { status: number; message: string } {
  switch (error) {
    case "daily_limit":
      return {
        status: 429,
        message: "Промокод можно применить раз в сутки. Попробуйте завтра.",
      };
    case "rate_limited":
      return { status: 429, message: "Слишком много попыток. Попробуйте позже." };
    case "already_used":
      return { status: 400, message: "Этот подарочный промокод уже использован" };
    case "already_redeemed":
      return { status: 400, message: "Вы уже применяли этот промокод" };
    case "inactive":
      return { status: 400, message: "Промокод больше не активен" };
    case "not_found":
      return { status: 400, message: "Промокод не найден" };
    default:
      return { status: 500, message: "Не удалось активировать промокод" };
  }
}

function mapUnifiedRedeemError(error: UnifiedRedeemError): { status: number; message: string } {
  if (
    error === "daily_limit" ||
    error === "rate_limited" ||
    error === "already_used" ||
    error === "already_redeemed" ||
    error === "inactive"
  ) {
    return mapPromoRedeemError(error);
  }
  return mapReferralApplyError(error);
}

// ── Web payment processing (shared between polling and webhook) ──

export async function processWebPaymentFromWebhook(paymentId: string, api?: Api): Promise<void> {
  const pending = getPendingPayment(paymentId);
  if (!pending || pending.status === "succeeded") return;

  // Atomic claim — see processSucceededPayment in api.ts for the rationale.
  // Wins exactly one of N concurrent webhook/poll calls per payment_id.
  const claimed = await markPaymentProcessed(paymentId);
  if (!claimed) {
    pending.status = "succeeded";
    return;
  }

  pending.status = "succeeded";

  const userId = pending.userId as string;
  const user = await getUserById(userId);
  const clientName = user ? getWebClientName(user) : `web_${userId.slice(0, 8)}`;

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

  let paidUser: UserRow | null = null;
  try {
    paidUser = await extendSubscriptionById(userId, pending.months, config);
  } catch (err) {
    console.error("DB upsert after web payment failed:", err);
  }

  if (paidUser) {
    try {
      const happPanel = await getHappPanelServer();
      if (happPanel) {
        let happUrl = paidUser.happ_subscription_url ?? null;
        if (happUrl) {
          await extendHapp(happPanel, clientName, pending.durationCode);
        } else {
          const result = await provisionHapp(happPanel, clientName, pending.durationCode);
          happUrl = result.url;
        }
        if (happUrl) {
          await updateUserHappUrl(paidUser.id, happUrl);
        }
      }
    } catch (err) {
      console.error("Web HAPP sync after payment failed:", err);
    }
  }

  if (paidUser && api) {
    try {
      const referralReward = await applyReferralRewardsForPayment(paymentId, paidUser.id);
      if (referralReward.applied) {
        await syncVpnForReferralReward(referralReward);
        await sendReferralRewardNotifications(api, referralReward);
      }
    } catch (err) {
      console.error("Referral rewards after web payment failed:", err);
    }
  }

  const plan = PRICING.find((p) => p.months === pending.months);
  const planLabel = plan?.label ?? `${pending.months} мес.`;
  const amountStr = `${pending.amount.toFixed(0)}₽`;
  const userName = user?.login ?? pending.firstName ?? "Веб-пользователь";
  const userTag = user?.login ? `login:${user.login}` : "без логина";
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
    } catch (err) {
      console.error(
        "Admin payment notification (web) failed:",
        { chatId: admin.chatId, topicId: admin.topicId, paymentId, userId },
        err,
      );
    }
  } else if (!rawBuyChat) {
    console.warn("ADMIN_CHAT_ID_BUY is not set — admin payment notification (web) skipped");
  }
}

// ── Mount all web routes ──

export function mountWebAuthRoutes(app: express.Express, api?: Api) {
  // ════════════════════════════════════════════════════════════
  //  Auth: register, login, refresh, me, change-password
  // ════════════════════════════════════════════════════════════

  app.post("/api/web/register", authRateLimiter, async (req, res) => {
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
    const existing = await getUserByLogin(normalizedLogin);
    if (existing) {
      res.status(409).json({ error: "Пользователь с таким логином уже существует" });
      return;
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createWebUser(normalizedLogin, hash);
    const tokens = generateTokens(user.id, 0);

    res.json({ user: sanitizeUser(user), ...tokens });
  });

  app.post("/api/web/login", authRateLimiter, async (req, res) => {
    const { login, password } = req.body ?? {};
    if (!login || !password) {
      res.status(400).json({ error: "Логин и пароль обязательны" });
      return;
    }

    const user = await getUserByLogin(normalizeLogin(login));
    if (!user || !user.password_hash) {
      res.status(401).json({ error: "Неверный логин или пароль" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Неверный логин или пароль" });
      return;
    }

    const pv = await getUserPasswordVersion(user.id);
    const tokens = generateTokens(user.id, pv);
    res.json({ user: sanitizeUser(user), ...tokens });
  });

  app.post("/api/web/refresh", authRateLimiter, async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken обязателен" });
      return;
    }

    const parsed = verifyRefreshToken(refreshToken);
    if (!parsed) {
      res.status(401).json({ error: "Refresh token невалиден или истёк" });
      return;
    }

    const user = await getUserById(parsed.userId);
    if (!user) {
      res.status(401).json({ error: "Пользователь не найден" });
      return;
    }

    const dbPv = await getUserPasswordVersion(user.id);
    if (parsed.pv !== dbPv) {
      res.status(401).json({ error: "Refresh token невалиден или истёк" });
      return;
    }

    const tokens = generateTokens(user.id, dbPv);
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
    const { rows } = await getPool().query<{ password_version: number }>(
      `UPDATE users
       SET password_hash = $1,
           password_version = COALESCE(password_version, 0) + 1
       WHERE id = $2
       RETURNING password_version`,
      [hash, userId],
    );
    const pv = rows[0]?.password_version ?? 0;
    const tokens = generateTokens(userId, pv);
    res.json({ ok: true, ...tokens });
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
    const referralInfo = await getUserReferralInfoForWeb(user.id);
    const expiredAt = user.expired_at ? new Date(user.expired_at) : null;
    const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
    let happUrl = user.happ_subscription_url ?? null;
    const happBackfillKey = `web:${user.id}`;
    if (active && !happUrl) {
      const backfillClaim = claimLazyHappBackfill(happBackfillKey);
      if (backfillClaim === "cooldown") {
        console.info(`Lazy web HAPP backfill skipped: retry cooldown for ${happBackfillKey}`);
      } else if (backfillClaim === "in_progress") {
        console.info(`Lazy web HAPP backfill skipped: already in progress for ${happBackfillKey}`);
      } else {
        try {
          const happPanel = await getHappPanelServer();
          if (!happPanel) {
            releaseLazyHappBackfill(happBackfillKey);
            console.info(`Lazy web HAPP backfill skipped: no enabled supports_happ server for ${happBackfillKey}`);
          } else {
            const durationCode = getHappDurationCodeForExpiry(expiredAt);
            const clientName = getWebClientName(user);
            console.info(`Lazy web HAPP backfill started for ${happBackfillKey} (${clientName}, ${durationCode})`);
            const result = await provisionHapp(happPanel, clientName, durationCode);
            happUrl = result.url;
            await updateUserHappUrl(user.id, happUrl);
            recordLazyHappBackfillSuccess(happBackfillKey);
            console.info(`Lazy web HAPP backfill succeeded for ${happBackfillKey}`);
          }
        } catch (err) {
          recordLazyHappBackfillFailure(happBackfillKey, "Lazy web HAPP backfill failed", err);
        }
      }
    }
    res.json({
      active,
      expired_at: user.expired_at,
      is_blocked: user.is_blocked,
      config: active ? user.vpn_config : null,
      happ_subscription_url: active ? happUrl : null,
      created_at: user.created_at,
      login: user.login,
      referred_by_applied: referralInfo.referred_by_applied,
      referred_by_code: referralInfo.referred_by_code,
      referral_message: referralInfo.referral_message,
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

  app.post("/api/web/promocode", webAuth, promoRateLimiter, async (req, res) => {
    const userId = getWebUserId(req);
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    if (!code) {
      res.status(400).json({ error: "Промокод обязателен" });
      return;
    }

    try {
      const redeemed = await redeemUnifiedCode(user.id, code);
      if (redeemed.ok && redeemed.kind === "gift") {
        let userRow = await getUserById(user.id);
        if (!userRow) throw new Error(`User missing after promo redeem: ${user.id}`);
        let config: string | null = userRow.vpn_config ?? null;
        const clientName = getWebClientName(userRow);
        try {
          const synced = await syncVpnForPromoRedemption(
            userRow,
            redeemed.months,
            clientName,
          );
          config = synced.config;
          userRow = await getUserById(user.id);
          if (!userRow) throw new Error(`User missing after VPN promo sync: ${user.id}`);
        } catch (err) {
          console.error("Web VPN sync after promo failed:", err);
          userRow = (await getUserById(user.id)) ?? userRow;
        }
        if (!userRow) throw new Error(`User missing after web promo sync fallback: ${user.id}`);
        config = config ?? userRow.vpn_config ?? null;
        if (api) {
          const userName = userRow.login ?? "Веб-пользователь";
          const userTag = userRow.telegram_nickname
            ? `@${userRow.telegram_nickname}`
            : userRow.login
              ? `login: ${userRow.login}`
              : "без контакта";
          await sendGiftPromoAdminNotification(api, {
            userName,
            userTag,
            telegramId: userRow.telegram_id,
            dbUserId: user.id,
            code,
            months: redeemed.months,
            oldExpiredAt: redeemed.oldExpiredAt,
            newExpiredAt: redeemed.newExpiredAt,
          });
        }

        try {
          const happPanel = await getHappPanelServer();
          if (happPanel) {
            const durationCode =
              PRICING.find((p) => p.months === redeemed.months)?.durationCode ?? "1m";
            let happUrl = userRow.happ_subscription_url ?? null;
            if (happUrl) {
              await extendHapp(happPanel, clientName, durationCode);
            } else {
              const result = await provisionHapp(
                happPanel,
                clientName,
                durationCode,
              );
              happUrl = result.url;
            }
            if (happUrl) {
              await updateUserHappUrl(user.id, happUrl);
              userRow = { ...userRow, happ_subscription_url: happUrl };
            }
          }
        } catch (err) {
          console.error("Web HAPP sync after promo failed:", err);
        }

        const referralInfo = await getUserReferralInfoForWeb(user.id);
        const expiredAt = userRow.expired_at ? new Date(userRow.expired_at) : null;
        const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
        res.json({
          ok: true,
          kind: "gift" as const,
          months: redeemed.months,
          subscription: {
            active,
            expired_at: userRow.expired_at,
            is_blocked: userRow.is_blocked,
            config: active ? (userRow.vpn_config ?? config ?? null) : null,
            happ_subscription_url: active ? (userRow.happ_subscription_url ?? null) : null,
            login: userRow.login,
            referred_by_applied: referralInfo.referred_by_applied,
            referred_by_code: referralInfo.referred_by_code,
            referral_message: referralInfo.referral_message,
          },
        });
        return;
      }

      if (redeemed.ok && redeemed.kind === "referral") {
        const referralInfo = await getUserReferralInfoForWeb(user.id);
        res.json({
          ok: true,
          kind: "referral" as const,
          referral_message: redeemed.referral_message,
          referred_by_applied: referralInfo.referred_by_applied,
          referred_by_code: referralInfo.referred_by_code,
        });
        return;
      }

      const mapped = mapUnifiedRedeemError(redeemed.error ?? "not_found");
      res.status(mapped.status).json({ error: mapped.message });
    } catch (err) {
      console.error("Apply web promocode failed:", err);
      res.status(500).json({ error: "Не удалось применить промокод" });
    }
  });

  app.post("/api/web/referral-code", webAuth, async (req, res) => {
    const userId = getWebUserId(req);
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    if (!code) {
      res.status(400).json({ error: "Введите реферальный код" });
      return;
    }

    try {
      const result = await applyReferralCode(user.id, code);
      if (!result.ok) {
        const mapped = mapReferralApplyError(result.error);
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }

      const referralInfo = await getUserReferralInfoForWeb(user.id);
      res.json({
        ok: true,
        referral_message: result.referral_message,
        referred_by_applied: referralInfo.referred_by_applied,
        referred_by_code: referralInfo.referred_by_code,
      });
    } catch (err) {
      console.error("Apply web referral code failed:", err);
      res.status(500).json({ error: "Не удалось применить реферальный код" });
    }
  });

  // ── VPN server reissue (смена сервера AmneziaWG, веб) ──

  app.post("/api/web/vpn/reissue", webAuth, async (req, res) => {
    const userId = getWebUserId(req);
    try {
      const userRow = await getUserById(userId);
      if (!userRow) {
        res.status(404).json({ error: "Пользователь не найден" });
        return;
      }
      const expiredAt = userRow.expired_at ? new Date(userRow.expired_at) : null;
      if (!expiredAt || expiredAt.getTime() <= Date.now()) {
        res.status(400).json({ error: "Подписка неактивна" });
        return;
      }

      const clientName = getWebClientName(userRow);
      const result = await reissueVpnConfig(userRow, clientName);
      res.json({ ok: true, config: result.config });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "no_other_servers") {
        res.status(409).json({ error: "Нет других доступных серверов для смены" });
        return;
      }
      if (msg === "subscription_inactive") {
        res.status(400).json({ error: "Подписка неактивна" });
        return;
      }
      console.error("Web VPN reissue error:", err);
      res.status(500).json({ error: "Не удалось сменить сервер. Попробуйте позже." });
    }
  });

  // ════════════════════════════════════════════════════════════
  //  Payments (YooKassa)
  // ════════════════════════════════════════════════════════════

  const shopId = (process.env.MERCHANT_SHOP_ID ?? "").trim();
  const secretKey = (process.env.MERCHANT_KEY ?? "").trim();
  const yookassaAuth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");

  app.post("/api/web/payments/create", webAuth, paymentCreateRateLimiter, async (req, res) => {
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
      username: user.login ?? "",
      first_name: user.login ?? "Веб-пользователь",
      months: String(plan.months),
      duration_code: plan.durationCode,
      is_renewal: isRenewal ? "1" : "0",
    };

    const siteOrigin = (process.env.WEB_SITE_URL ?? "").trim();
    if (!siteOrigin) {
      res.status(503).json({ error: "WEB_SITE_URL is not configured" });
      return;
    }
    const returnUrl = `${siteOrigin}?payment_return=1`;

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
        username: user.login ?? "",
        firstName: user.login ?? "Веб-пользователь",
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
    if (!paymentId || !isValidPaymentId(paymentId)) {
      res.status(400).json({ error: "Invalid paymentId" });
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

  app.get("/api/web/support/messages", webAuth, async (req: express.Request, res: express.Response) => {
    const userId = getWebUserId(req);
    const after = req.query.after ? Number(req.query.after) : undefined;
    try {
      const user = await getUserById(userId);
      if (!user?.telegram_id) {
        res.status(403).json({ error: "Support chat requires Telegram sync" });
        return;
      }
      res.json({ messages: getSupportMessages(user.telegram_id, after) });
    } catch {
      res.status(500).json({ error: "Failed to check sync status" });
    }
  });

  app.post("/api/web/support/send", webAuth, async (req: express.Request, res: express.Response) => {
    if (!api) {
      res.status(503).json({ error: "Support unavailable" });
      return;
    }

    const userId = getWebUserId(req);
    const user = await getUserById(userId);
    if (!user?.telegram_id) {
      res.status(403).json({ error: "Support chat requires Telegram sync" });
      return;
    }

    const { text } = req.body;
    if (!text?.trim()) {
      res.status(400).json({ error: "Empty message" });
      return;
    }

    try {
      const actor = await resolveSupportActor(api, user);
      if (!actor) {
        res.status(403).json({ error: "Support chat requires Telegram sync" });
        return;
      }
      const message = await sendSupportTextMessage(api, actor, text);
      res.json({ message });
    } catch (err) {
      if (err instanceof Error && err.message === "support_unavailable") {
        res.status(503).json({ error: "Support unavailable" });
        return;
      }
      if (err instanceof Error && err.message === "empty_message") {
        res.status(400).json({ error: "Empty message" });
        return;
      }
      console.error("Web support send error:", err);
      res.status(500).json({ error: "Failed to send" });
    }
  });
}

function sanitizeUser(user: UserRow) {
  const expiredAt = user.expired_at ? new Date(user.expired_at) : null;
  const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
  return {
    id: user.id,
    login: user.login,
    auth_source: user.auth_source,
    active,
    expired_at: user.expired_at,
    is_blocked: user.is_blocked,
    created_at: user.created_at,
    has_config: !!user.vpn_config && active,
  };
}
