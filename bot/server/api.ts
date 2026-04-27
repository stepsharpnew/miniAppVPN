import crypto from "crypto";
import https from "https";
import express from "express";
import cors from "cors";
import multer from "multer";
import { type Api, InputFile } from "grammy";
import { addMessage, getMessages, hasMessages } from "./chat-store";
import { resolveAdminChat, saveForwardedMessage, setActiveDialog } from "./store";
import {
  BRAND_NAME,
  escapeHtml,
  PAYMENT_ADMIN_NOTIFY,
  PAYMENT_SUCCESS_USER,
  SUPPORT_MEDIA_CAPTION_ADMIN,
  SUPPORT_TICKET_ADMIN,
  SUPPORT_USER_TEXT_ADMIN,
} from "../shared/texts";
import { type PaymentMetadata, PRICING } from "../shared/plans";
import { getConfig, saveConfig } from "./config-store";
import { extendVpnClient, provisionVpnClient } from "./vpn";
import {
  getPendingPayment,
  markPaymentCanceled,
  markPaymentSucceeded,
  savePendingPayment,
} from "./payment-store";
import {
  applyReferralCode,
  applyReferralRewardsForPayment,
  createTelegramUserIfMissing,
  getUserById,
  getUserReferralInfo,
  redeemPromoCode,
  type ServerRow,
  type UserRow,
  getAllEnabledServers,
  getRandomEnabledServer,
  getUserSubscription,
  incrementServerUserCount,
  isPaymentProcessed,
  markPaymentProcessed,
  upsertUserSubscription,
} from "./db";
import { getTelegramClientName, syncVpnForPromoRedemption } from "./promo-vpn";
import { mountWebAuthRoutes } from "./web-auth";
import { mountSyncRoutes } from "./sync-routes";
import { PLATFORM_BOT_TEXTS, type PlatformId } from "../shared/platforms";
import {
  getSupportMessages,
  sendSupportTextMessage,
} from "./support-service";
import { sendReferralRewardNotifications } from "./referral-notifications";

function getServerBaseUrl(server: ServerRow): string {
  const raw = server.domain_server_name;
  if (!raw) throw new Error(`Server ${server.server_id} has no domain_server_name (base URL)`);
  return raw.replace(/\/+$/, "");
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

function normalizeTelegramNickname(username?: string): string | null {
  if (!username) return null;
  const trimmed = username.trim();
  if (!trimmed) return null;
  // Legacy fallback value from older flow should not be stored as nickname.
  if (trimmed.startsWith("tg_")) return null;
  return trimmed;
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
    case "rate_limited":
      return { status: 429, message: "Слишком много попыток. Попробуйте позже." };
    case "already_used":
      return { status: 400, message: "Этот подарочный промокод уже использован" };
    case "not_found":
      return { status: 400, message: "Промокод не найден" };
    default:
      return { status: 500, message: "Не удалось активировать промокод" };
  }
}

/** @MemeVPNbest — подписка на канал; пусто = не требовать (удобно для локальной разработки). */
function requiredChannelUsername(): string {
  return (process.env.REQUIRED_CHANNEL_USERNAME ?? "").trim();
}

function isChannelMemberStatus(status: string): boolean {
  return (
    status === "creator" ||
    status === "administrator" ||
    status === "member" ||
    status === "restricted"
  );
}

function verifyInitData(
  initData: string,
  botToken: string,
): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const calculated = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculated !== hash) return null;

    const userStr = params.get("user");
    if (!userStr) return null;
    return JSON.parse(userStr) as TelegramUser;
  } catch {
    return null;
  }
}

export function createApiServer(api: Api, botToken: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  function auth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void {
    const initData = req.headers["x-telegram-init-data"];
    if (typeof initData !== "string" || !initData) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = verifyInitData(initData, botToken);
    if (!user) {
      res.status(401).json({ error: "Invalid auth" });
      return;
    }
    (req as any).tgUser = user;
    next();
  }

  function getUser(req: express.Request): TelegramUser {
    return (req as any).tgUser;
  }

  const requireChannelSubscription: express.RequestHandler = async (
    req,
    res,
    next,
  ) => {
    const ch = requiredChannelUsername();
    if (!ch) {
      next();
      return;
    }
    const user = getUser(req);
    const chatId = ch.startsWith("@") ? ch : `@${ch}`;
    try {
      const member = await api.getChatMember(chatId, user.id);
      if (!isChannelMemberStatus(member.status)) {
        res.status(403).json({
          error: "channel_subscription_required",
          subscribed: false,
        });
        return;
      }
      next();
    } catch (err) {
      console.error("getChatMember (API guard):", err);
      res.status(503).json({ error: "channel_check_failed" });
    }
  };

  // ── Channel membership (Mini App gate; бот должен быть админом канала) ──

  app.get("/api/channel-subscription", auth, async (req, res) => {
    const ch = requiredChannelUsername();
    if (!ch) {
      res.json({ subscribed: true, channelUrl: null as string | null });
      return;
    }
    const user = getUser(req);
    const chatId = ch.startsWith("@") ? ch : `@${ch}`;
    const channelUrl = `https://t.me/${ch.replace(/^@/, "")}`;
    try {
      const member = await api.getChatMember(chatId, user.id);
      res.json({
        subscribed: isChannelMemberStatus(member.status),
        channelUrl,
      });
    } catch (err) {
      console.error("getChatMember (/api/channel-subscription):", err);
      res.json({ subscribed: false, channelUrl });
    }
  });

  // ── Messages history ──

  app.post("/api/instructions/send", auth, requireChannelSubscription, async (req, res) => {
    const user = getUser(req);
    const platformIdRaw =
      typeof req.body?.platformId === "string" ? req.body.platformId : "";
    const platformId = platformIdRaw as PlatformId;
    const instructionText = PLATFORM_BOT_TEXTS[platformId];

    if (!instructionText) {
      res.status(400).json({ error: "Unknown platform" });
      return;
    }

    try {
      await api.sendMessage(user.id, instructionText);
      res.json({ ok: true });
    } catch (error) {
      console.error("Instruction send error:", error);
      res.status(500).json({ error: "Failed to send instruction" });
    }
  });

  app.get("/api/support/messages", auth, requireChannelSubscription, (req, res) => {
    const user = getUser(req);
    const after = req.query.after ? Number(req.query.after) : undefined;
    res.json({ messages: getSupportMessages(user.id, after) });
  });

  // ── Send text ──

  app.post("/api/support/send", auth, requireChannelSubscription, async (req, res) => {
    const user = getUser(req);
    const { text } = req.body;
    if (!text?.trim()) {
      res.status(400).json({ error: "Empty message" });
      return;
    }

    try {
      const message = await sendSupportTextMessage(api, {
        dialogUserId: user.id,
        userName: user.first_name,
        userTag: user.username ? `@${user.username}` : "без @ника",
      }, text);
      res.json({ message });
    } catch (error) {
      if (error instanceof Error && error.message === "support_unavailable") {
        res.status(503).json({ error: "Support unavailable" });
        return;
      }
      console.error("API send error:", error);
      res.status(500).json({ error: "Failed to send" });
    }
  });

  // ── Upload file / photo ──

  app.post(
    "/api/support/upload",
    auth,
    requireChannelSubscription,
    upload.single("file"),
    async (req, res) => {
      const user = getUser(req);
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file" });
        return;
      }

      const raw = process.env.ADMIN_CHAT_ID_SUPPORT;
      if (!raw) {
        res.status(503).json({ error: "Support unavailable" });
        return;
      }

      const { chatId, topicId } = resolveAdminChat(raw);
      const userName = user.first_name;
      const userTag = user.username ? `@${user.username}` : "без @ника";
      const caption = SUPPORT_MEDIA_CAPTION_ADMIN(userName, userTag, user.id);
      const topicOpts =
        topicId !== undefined ? { message_thread_id: topicId } : {};
      const isImage = file.mimetype.startsWith("image/");

      try {
        const inputFile = new InputFile(file.buffer, file.originalname);
        let sent;

        if (isImage) {
          sent = await api.sendPhoto(chatId, inputFile, {
            caption,
            parse_mode: "HTML",
            ...topicOpts,
          });
        } else {
          sent = await api.sendDocument(chatId, inputFile, {
            caption,
            parse_mode: "HTML",
            ...topicOpts,
          });
        }

        saveForwardedMessage(chatId, sent.message_id, user.id);
        setActiveDialog(user.id, { chatId, topicId });

        const message = addMessage(user.id, {
          from: "user",
          type: isImage ? "photo" : "document",
          fileName: file.originalname,
        });

        res.json({ message });
      } catch (error) {
        console.error("API upload error:", error);
        res.status(500).json({ error: "Failed to upload" });
      }
    },
  );

  // ── Proxy Telegram files (for admin-sent photos/docs) ──

  app.get("/api/support/file/:fileId", auth, requireChannelSubscription, async (req, res) => {
    try {
      const raw = req.params.fileId;
      const fileId = typeof raw === "string" ? raw : raw?.[0];
      if (!fileId) {
        res.status(400).json({ error: "Missing file id" });
        return;
      }
      const tgFile = await api.getFile(fileId);
      const url = `https://api.telegram.org/file/bot${botToken}/${tgFile.file_path}`;

      https
        .get(url, (upstream) => {
          if (upstream.headers["content-type"]) {
            res.set("Content-Type", upstream.headers["content-type"]);
          }
          upstream.pipe(res);
        })
        .on("error", () => {
          res.status(500).json({ error: "Fetch failed" });
        });
    } catch {
      res.status(404).json({ error: "File not found" });
    }
  });

  // ── Get VPN config after payment ──

  app.get("/api/payments/config", auth, requireChannelSubscription, async (req, res) => {
    const user = getUser(req);
    const memConfig = getConfig(user.id);
    if (memConfig) {
      res.json({ config: memConfig });
      return;
    }
    try {
      const row = await getUserSubscription(user.id);
      if (row?.vpn_config) {
        res.json({ config: row.vpn_config });
        return;
      }
    } catch (err) {
      console.error("DB config lookup error:", err);
    }
    res.status(404).json({ error: "Config not ready" });
  });

  // ── Send config as .conf file directly to user's Telegram chat ──

  app.post("/api/payments/config/send-file", auth, requireChannelSubscription, async (req, res) => {
    const user = getUser(req);
    // Prefer explicit config from client (e.g. when user opens Profile later),
    // fallback to server-side temporary store (right after payment).
    const bodyConfig =
      typeof req.body?.config === "string" ? req.body.config : null;
    const config = (bodyConfig && bodyConfig.trim().length > 0)
      ? bodyConfig
      : getConfig(user.id);
    if (!config) {
      res.status(404).json({ error: "Config not ready" });
      return;
    }

    try {
      const file = new InputFile(Buffer.from(config, "utf-8"), "meme-vpn.conf");
      await api.sendDocument(user.id, file, {
        caption: "🔑 Ваш VPN-конфиг. Откройте файл в приложении AmneziaWG.",
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Send config file error:", err);
      res.status(500).json({ error: "Failed to send file" });
    }
  });

  // ── Subscription status ──

  app.get("/api/subscription", auth, requireChannelSubscription, async (req, res) => {
    const user = getUser(req);
    try {
      const row = await createTelegramUserIfMissing(
        user.id,
        normalizeTelegramNickname(user.username),
      );
      const referralInfo = await getUserReferralInfo(row.id);
      const expiredAt = row.expired_at ? new Date(row.expired_at) : null;
      const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
      res.json({
        active,
        expired_at: row.expired_at,
        is_blocked: row.is_blocked,
        telegram_nickname: row.telegram_nickname,
        config: active ? row.vpn_config : null,
        created_at: row.created_at,
        my_referral_code: referralInfo.my_referral_code,
        referred_by_applied: referralInfo.referred_by_applied,
        referred_by_code: referralInfo.referred_by_code,
        referral_message: referralInfo.referral_message,
      });
    } catch (err) {
      console.error("Subscription check error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/promocode", auth, requireChannelSubscription, async (req, res) => {
    const tgUser = getUser(req);
    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    if (!code) {
      res.status(400).json({ error: "Промокод обязателен" });
      return;
    }

    try {
      const dbUser = await createTelegramUserIfMissing(
        tgUser.id,
        normalizeTelegramNickname(tgUser.username),
      );

      const promo = await redeemPromoCode(dbUser.id, code);
      if (promo.ok && promo.months != null) {
        let userRow = await getUserById(dbUser.id);
        if (!userRow) throw new Error(`User missing after promo redeem: ${dbUser.id}`);
        const { config } = await syncVpnForPromoRedemption(
          userRow,
          promo.months,
          getTelegramClientName(tgUser.id, tgUser.username),
        );
        userRow = await getUserById(dbUser.id);
        if (!userRow) throw new Error(`User missing after VPN promo sync: ${dbUser.id}`);
        const referralInfo = await getUserReferralInfo(dbUser.id);
        const expiredAt = userRow.expired_at ? new Date(userRow.expired_at) : null;
        const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
        res.json({
          ok: true,
          kind: "gift" as const,
          months: promo.months,
          subscription: {
            active,
            expired_at: userRow.expired_at,
            is_blocked: userRow.is_blocked,
            config: active ? (userRow.vpn_config ?? config ?? null) : null,
            my_referral_code: referralInfo.my_referral_code,
            referred_by_applied: referralInfo.referred_by_applied,
            referred_by_code: referralInfo.referred_by_code,
            referral_message: referralInfo.referral_message,
          },
        });
        return;
      }

      const promoErr = mapPromoRedeemError(promo.error);
      res.status(promoErr.status).json({ error: promoErr.message });
    } catch (err) {
      console.error("Promocode apply error:", err);
      res.status(500).json({ error: "Не удалось применить промокод" });
    }
  });

  app.post("/api/referral-code", auth, requireChannelSubscription, async (req, res) => {
    const tgUser = getUser(req);
    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    if (!code) {
      res.status(400).json({ error: "Введите реферальный код" });
      return;
    }

    try {
      const dbUser = await createTelegramUserIfMissing(
        tgUser.id,
        normalizeTelegramNickname(tgUser.username),
      );
      const result = await applyReferralCode(dbUser.id, code);
      if (!result.ok) {
        const mapped = mapReferralApplyError(result.error);
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }

      const referralInfo = await getUserReferralInfo(dbUser.id);
      res.json({
        ok: true,
        referral_message: result.referral_message,
        my_referral_code: referralInfo.my_referral_code,
        referred_by_applied: referralInfo.referred_by_applied,
        referred_by_code: referralInfo.referred_by_code,
      });
    } catch (err) {
      console.error("Referral code apply error:", err);
      res.status(500).json({ error: "Не удалось применить реферальный код" });
    }
  });

  // ── YooKassa: create payment (redirect flow) ──

  const shopId = (process.env.MERCHANT_SHOP_ID ?? "").trim();
  const secretKey = (process.env.MERCHANT_KEY ?? "").trim();
  const yookassaAuth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const webappUrl = (process.env.WEBAPP_URL ?? "").trim();

  let cachedBotUsername: string | null = null;
  async function getBotUsername(): Promise<string> {
    if (!cachedBotUsername) {
      try {
        const me = await api.getMe();
        cachedBotUsername = me.username ?? "";
      } catch { cachedBotUsername = ""; }
    }
    return cachedBotUsername;
  }

  app.post("/api/payments/create-payment", auth, requireChannelSubscription, async (req, res) => {
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

    const user = getUser(req);
    const idempotenceKey = crypto.randomUUID();
    const botUsername = await getBotUsername();

    let isRenewal = false;
    try {
      const existing = await getUserSubscription(user.id);
      if (existing?.expired_at) {
        isRenewal = new Date(existing.expired_at).getTime() > Date.now();
      }
    } catch { /* treat as new purchase */ }

    const metadata: PaymentMetadata = {
      telegram_user_id: String(user.id),
      username: user.username ?? "",
      first_name: user.first_name,
      months: String(plan.months),
      duration_code: plan.durationCode,
      is_renewal: isRenewal ? "1" : "0",
    };

    const baseUrl = webappUrl ? new URL(webappUrl).origin : "";
    const returnUrl = baseUrl
      ? `${baseUrl}/payment-return.html?bot=${encodeURIComponent(botUsername)}`
      : "https://t.me/" + botUsername;

    const description = isRenewal
      ? `${BRAND_NAME} — Продление: ${plan.label}`
      : `${BRAND_NAME} — ${plan.label}`;

    const body = JSON.stringify({
      amount: { value: plan.price.toFixed(2), currency: "RUB" },
      confirmation: {
        type: "redirect",
        return_url: returnUrl,
      },
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
        console.error("YooKassa create-payment error:", ykRes.status, text);
        res.status(502).json({ error: "Payment provider error" });
        return;
      }

      const payment = await ykRes.json();
      const confirmationUrl: string = payment.confirmation?.confirmation_url;
      if (!confirmationUrl) {
        console.error("YooKassa response missing confirmation_url:", payment);
        res.status(502).json({ error: "Invalid payment provider response" });
        return;
      }

      savePendingPayment({
        paymentId: payment.id,
        userId: user.id,
        username: user.username ?? "",
        firstName: user.first_name,
        months: plan.months,
        durationCode: plan.durationCode,
        amount: plan.price,
        status: "pending",
        isRenewal,
        source: "telegram",
      });

      res.json({ confirmationUrl, paymentId: payment.id });
    } catch (err) {
      console.error("YooKassa create-payment fetch error:", err);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  // ── YooKassa: poll payment status from frontend ──

  async function processSucceededPayment(paymentId: string): Promise<void> {
    const pending = getPendingPayment(paymentId);
    if (!pending || pending.status === "succeeded") return;

    // NB: idempotency flag is set AFTER everything below succeeds far enough to
    // notify admin; otherwise a transient error would leave the payment in a
    // "processed but silent" state forever (no admin notif on retries).
    if (await isPaymentProcessed(paymentId)) {
      pending.status = "succeeded";
      return;
    }

    pending.status = "succeeded";

    const userId = pending.userId as number;
    let config = pending.config ?? getConfig(userId) ?? undefined;
    let provisionOk = !!config;

    if (!config) {
      try {
        const existingUser = await getUserSubscription(userId);
        if (existingUser?.vpn_config) {
          config = existingUser.vpn_config;
          provisionOk = true;
          const clientName = pending.username || `tg_${userId}`;
          try {
            const servers = await getAllEnabledServers();
            let extended = false;
            for (const srv of servers) {
              try {
                await extendVpnClient(clientName, pending.durationCode, getServerBaseUrl(srv));
                extended = true;
                break;
              } catch { /* client not on this VM, try next */ }
            }
            if (!extended) console.error("VPN extend (renewal): client not found on any server");
          } catch (err) {
            console.error("VPN extend (renewal) failed:", err);
          }
        }
      } catch (err) {
        console.error("DB config lookup for renewal failed:", err);
      }
    }

    if (!config) {
      try {
        const server = await getRandomEnabledServer();
        if (!server?.server_id) throw new Error("No enabled VPN servers in DB");
        const baseUrl = getServerBaseUrl(server);
        const clientName = pending.username || `tg_${userId}`;
        config = await provisionVpnClient(clientName, pending.durationCode, server.server_id, baseUrl);
        provisionOk = true;
        saveConfig(userId, config);
        await incrementServerUserCount(server.server_id).catch(() => {});
      } catch (err) {
        console.error("VPN provisioning (status poll) failed:", err);
      }
    }

    markPaymentSucceeded(paymentId, config);

    let paidUser: UserRow | null = null;
    try {
      paidUser = await upsertUserSubscription(
        userId,
        pending.months,
        config,
        normalizeTelegramNickname(pending.username),
      );
    } catch (err) {
      console.error("DB upsert after payment failed:", err);
    }

    if (paidUser) {
      try {
        const referralReward = await applyReferralRewardsForPayment(paymentId, paidUser.id);
        if (referralReward.applied) {
          await sendReferralRewardNotifications(api, referralReward);
        }
      } catch (err) {
        console.error("Referral rewards after payment failed:", err);
      }
    }

    const plan = PRICING.find((p) => p.months === pending.months);
    const planLabel = plan?.label ?? `${pending.months} мес.`;
    const amountStr = `${pending.amount.toFixed(0)}₽`;
    const userTag =
      pending.username && pending.username !== `tg_${userId}`
        ? `@${pending.username}`
        : "без @ника";

    try {
      await api.sendMessage(userId, PAYMENT_SUCCESS_USER(planLabel, amountStr, pending.isRenewal), {
        parse_mode: "HTML",
      });
    } catch (err) {
      console.error("User payment notification failed:", userId, err);
    }

    const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY;
    if (rawBuyChat) {
      const admin = resolveAdminChat(rawBuyChat);
      try {
        await api.sendMessage(
          admin.chatId,
          PAYMENT_ADMIN_NOTIFY(pending.firstName, userTag, userId, planLabel, amountStr, provisionOk, pending.isRenewal),
          {
            parse_mode: "HTML",
            ...(admin.topicId !== undefined ? { message_thread_id: admin.topicId } : {}),
          },
        );
      } catch (err) {
        console.error(
          "Admin payment notification failed:",
          { chatId: admin.chatId, topicId: admin.topicId, paymentId, userId },
          err,
        );
      }
    } else {
      console.warn("ADMIN_CHAT_ID_BUY is not set — admin payment notification skipped");
    }

    // Mark idempotency flag last: if an unhandled error sneaks past the catches
    // above, the next webhook/poll will retry the whole flow instead of silently
    // skipping it (which is what made the renewal admin notification disappear).
    await markPaymentProcessed(paymentId);
  }

  app.get("/api/payments/status/:paymentId", auth, requireChannelSubscription, async (req, res) => {
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

    const user = getUser(req);
    if (pending.userId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // If still pending locally, check YooKassa API directly (webhook may be delayed)
    if (pending.status === "pending" && shopId && secretKey) {
      try {
        const ykRes = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
          headers: { Authorization: `Basic ${yookassaAuth}` },
        });
        if (ykRes.ok) {
          const ykPayment = await ykRes.json();
          if (ykPayment.status === "succeeded") {
            await processSucceededPayment(paymentId);
          } else if (ykPayment.status === "canceled") {
            markPaymentCanceled(paymentId);
          }
        }
      } catch (e) {
        console.error("YooKassa status check error:", e);
      }
    }

    const updated = getPendingPayment(paymentId);
    res.json({
      status: updated?.status ?? pending.status,
      config: updated?.config ?? pending.config ?? null,
    });
  });

  // ── YooKassa: webhook (payment.succeeded / payment.canceled) ──

  app.post("/api/payments/webhook", async (req, res) => {
    const event = req.body?.event;
    const paymentObj = req.body?.object;
    if (!paymentObj?.id) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const paymentId: string = paymentObj.id;
    const meta = paymentObj.metadata as PaymentMetadata | undefined;

    if (event === "payment.canceled") {
      markPaymentCanceled(paymentId);
      res.json({ ok: true });
      return;
    }

    if (event !== "payment.succeeded") {
      res.json({ ok: true });
      return;
    }

    // Verify payment status via YooKassa API
    let verifiedStatus = paymentObj.status;
    if (shopId && secretKey) {
      try {
        const check = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
          headers: { Authorization: `Basic ${yookassaAuth}` },
        });
        if (check.ok) {
          const verified = await check.json();
          verifiedStatus = verified.status;
        }
      } catch (e) {
        console.error("YooKassa verify fetch error:", e);
      }
    }

    if (verifiedStatus !== "succeeded") {
      res.json({ ok: true });
      return;
    }

    // If payment is in local store, use shared processing path
    const pending = getPendingPayment(paymentId);
    if (pending && pending.status !== "succeeded") {
      if (pending.source === "web") {
        const { processWebPaymentFromWebhook } = await import("./web-auth");
        await processWebPaymentFromWebhook(paymentId, api);
      } else {
        await processSucceededPayment(paymentId);
      }
      res.json({ ok: true });
      return;
    }

    // Fallback: payment not in local store (e.g. server restarted) — use webhook metadata
    if (await isPaymentProcessed(paymentId)) {
      res.json({ ok: true });
      return;
    }

    const userId = meta ? Number(meta.telegram_user_id) : 0;
    if (!userId) {
      console.error("Webhook: cannot resolve userId for payment", paymentId);
      res.json({ ok: true });
      return;
    }

    const username = meta?.username ?? "";
    const firstName = meta?.first_name ?? "Аноним";
    const months = meta ? Number(meta.months) : 0;
    const durationCode = meta?.duration_code ?? "1m";
    const isRenewal = meta?.is_renewal === "1";
    const amount = paymentObj.amount ? Number(paymentObj.amount.value) : 0;

    let config = getConfig(userId) ?? undefined;
    let provisionOk = !!config;

    if (!config) {
      try {
        const existingUser = await getUserSubscription(userId);
        if (existingUser?.vpn_config) {
          config = existingUser.vpn_config;
          provisionOk = true;
          const clientName = username || `tg_${userId}`;
          try {
            const servers = await getAllEnabledServers();
            let extended = false;
            for (const srv of servers) {
              try {
                await extendVpnClient(clientName, durationCode, getServerBaseUrl(srv));
                extended = true;
                break;
              } catch { /* client not on this VM, try next */ }
            }
            if (!extended) console.error("VPN extend (webhook renewal): client not found on any server");
          } catch (err) {
            console.error("VPN extend (webhook renewal) failed:", err);
          }
        }
      } catch (err) {
        console.error("DB config lookup (webhook) failed:", err);
      }
    }

    if (!config) {
      try {
        const server = await getRandomEnabledServer();
        if (!server?.server_id) throw new Error("No enabled VPN servers in DB");
        const baseUrl = getServerBaseUrl(server);
        const clientName = username || `tg_${userId}`;
        config = await provisionVpnClient(clientName, durationCode, server.server_id, baseUrl);
        provisionOk = true;
        saveConfig(userId, config);
        await incrementServerUserCount(server.server_id).catch(() => {});
      } catch (err) {
        console.error("VPN provisioning after webhook failed:", err);
      }
    }

    let paidUser: UserRow | null = null;
    try {
      paidUser = await upsertUserSubscription(
        userId,
        months,
        config,
        normalizeTelegramNickname(username),
      );
    } catch (err) {
      console.error("DB upsert after webhook payment failed:", err);
    }

    if (paidUser) {
      try {
        const referralReward = await applyReferralRewardsForPayment(paymentId, paidUser.id);
        if (referralReward.applied) {
          await sendReferralRewardNotifications(api, referralReward);
        }
      } catch (err) {
        console.error("Referral rewards after webhook payment failed:", err);
      }
    }

    const plan = PRICING.find((p) => p.months === months);
    const planLabel = plan?.label ?? `${months} мес.`;
    const amountStr = `${amount.toFixed(0)}₽`;
    const userTag = username && username !== `tg_${userId}` ? `@${username}` : "без @ника";

    try {
      await api.sendMessage(userId, PAYMENT_SUCCESS_USER(planLabel, amountStr, isRenewal), {
        parse_mode: "HTML",
      });
    } catch (err) {
      console.error("User payment notification (webhook) failed:", userId, err);
    }

    const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY;
    if (rawBuyChat) {
      const admin = resolveAdminChat(rawBuyChat);
      try {
        await api.sendMessage(
          admin.chatId,
          PAYMENT_ADMIN_NOTIFY(firstName, userTag, userId, planLabel, amountStr, provisionOk, isRenewal),
          {
            parse_mode: "HTML",
            ...(admin.topicId !== undefined ? { message_thread_id: admin.topicId } : {}),
          },
        );
      } catch (err) {
        console.error(
          "Admin payment notification (webhook) failed:",
          { chatId: admin.chatId, topicId: admin.topicId, paymentId, userId },
          err,
        );
      }
    } else {
      console.warn("ADMIN_CHAT_ID_BUY is not set — admin payment notification (webhook) skipped");
    }

    // Mark idempotency only after we've at least attempted to notify admin/user
    // so transient failures don't permanently silence renewal notifications.
    await markPaymentProcessed(paymentId);

    res.json({ ok: true });
  });

  // ── Web auth routes (email/password, JWT) ──
  mountWebAuthRoutes(app, api);

  // ── Sync routes (Telegram ↔ Web, email verification) ──
  mountSyncRoutes(app, auth);

  return app;
}
