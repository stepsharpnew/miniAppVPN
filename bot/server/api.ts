import crypto from "crypto";
import https from "https";
import express from "express";
import cors from "cors";
import multer from "multer";
import cron from "node-cron";
import { type Api, InputFile } from "grammy";
import { addMessage, getMessages, hasMessages } from "./chat-store";
import { resolveAdminChat, saveForwardedMessage, setActiveDialog } from "./store";
import {
  BRAND_NAME,
  PAYMENT_ADMIN_NOTIFY,
  PAYMENT_SUCCESS_USER,
  SUBSCRIPTION_REMINDER_D1,
  SUBSCRIPTION_REMINDER_D3,
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
  ensureLegacyConfigMigrated,
  getEnabledServersByIds,
  getUsersForReminder,
  markUserNotificated,
  unmarkUserNotificated,
  type ReminderType,
  type ServerRow,
  getAllEnabledServers,
  getUserConfigurations,
  getRandomEnabledServer,
  getUserSubscription,
  incrementServerUserCount,
  upsertUserConfiguration,
  upsertUserSubscription,
} from "./db";

function getServerBaseUrl(server: ServerRow): string {
  const raw = server.domain_server_name;
  if (!raw) throw new Error(`Server ${server.server_id} has no domain_server_name (base URL)`);
  return raw.replace(/\/+$/, "");
}

async function getPrimaryConfig(userId: number): Promise<string | null> {
  await ensureLegacyConfigMigrated(userId);
  const configs = await getUserConfigurations(userId);
  const first = configs.find((c) => c.config_number === 1);
  return first?.vpn_config ?? null;
}

async function pickServerForSecondConfig(userId: number): Promise<ServerRow | null> {
  const enabled = await getAllEnabledServers();
  if (enabled.length === 0) return null;

  await ensureLegacyConfigMigrated(userId);
  const currentConfigs = await getUserConfigurations(userId);
  const usedServerIds = currentConfigs
    .map((c) => c.server_id)
    .filter((id): id is string => !!id);

  if (usedServerIds.length === 0) {
    return enabled[Math.floor(Math.random() * enabled.length)];
  }

  const usedServers = await getEnabledServersByIds(usedServerIds);
  const used = new Set(usedServers.map((s) => s.server_id));
  const candidates = enabled.filter((s) => !used.has(s.server_id));
  const pool = candidates.length > 0 ? candidates : enabled;
  return pool[Math.floor(Math.random() * pool.length)];
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

  // ── Messages history ──

  app.get("/api/support/messages", auth, (req, res) => {
    const user = getUser(req);
    const after = req.query.after ? Number(req.query.after) : undefined;
    res.json({ messages: getMessages(user.id, after) });
  });

  // ── Send text ──

  app.post("/api/support/send", auth, async (req, res) => {
    const user = getUser(req);
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

    const { chatId, topicId } = resolveAdminChat(raw);
    const userName = user.first_name;
    const userTag = user.username ? `@${user.username}` : "без @ника";
    const isNew = !hasMessages(user.id);

    try {
      const message = addMessage(user.id, {
        from: "user",
        type: "text",
        text: text.trim(),
      });

      const adminText = isNew
        ? SUPPORT_TICKET_ADMIN(userName, userTag, user.id, text.trim())
        : SUPPORT_USER_TEXT_ADMIN(userName, userTag, user.id, text.trim());

      const sent = await api.sendMessage(chatId, adminText, {
        parse_mode: "HTML",
        ...(topicId !== undefined ? { message_thread_id: topicId } : {}),
      });

      saveForwardedMessage(chatId, sent.message_id, user.id);
      setActiveDialog(user.id, { chatId, topicId });

      res.json({ message });
    } catch (error) {
      console.error("API send error:", error);
      res.status(500).json({ error: "Failed to send" });
    }
  });

  // ── Upload file / photo ──

  app.post(
    "/api/support/upload",
    auth,
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

  app.get("/api/support/file/:fileId", auth, async (req, res) => {
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

  app.get("/api/payments/config", auth, async (req, res) => {
    const user = getUser(req);
    const memConfig = getConfig(user.id);
    if (memConfig) {
      res.json({ config: memConfig });
      return;
    }
    try {
      const primaryConfig = await getPrimaryConfig(user.id);
      if (primaryConfig) {
        res.json({ config: primaryConfig });
        return;
      }
    } catch (err) {
      console.error("DB config lookup error:", err);
    }
    res.status(404).json({ error: "Config not ready" });
  });

  // ── Send config as .conf file directly to user's Telegram chat ──

  app.post("/api/payments/config/send-file", auth, async (req, res) => {
    const user = getUser(req);
    // Prefer explicit config from client (e.g. when user opens Profile later),
    // fallback to server-side temporary store (right after payment).
    const bodyConfig =
      typeof req.body?.config === "string" ? req.body.config : null;
    let config = (bodyConfig && bodyConfig.trim().length > 0)
      ? bodyConfig
      : getConfig(user.id);
    if (!config) {
      config = await getPrimaryConfig(user.id);
    }
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

  app.get("/api/subscription", auth, async (req, res) => {
    const user = getUser(req);
    try {
      const row = await getUserSubscription(user.id);
      if (!row) {
        res.json({ active: false, expired_at: null, config: null });
        return;
      }
      const expiredAt = row.expired_at ? new Date(row.expired_at) : null;
      const active = expiredAt ? expiredAt.getTime() > Date.now() : false;
      res.json({
        active,
        expired_at: row.expired_at,
        is_blocked: row.is_blocked,
        telegram_nickname: row.telegram_nickname,
        config: active ? row.vpn_config : null,
        created_at: row.created_at,
      });
    } catch (err) {
      console.error("Subscription check error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // ── User configurations ──

  app.get("/api/configurations", auth, async (req, res) => {
    const user = getUser(req);
    try {
      await ensureLegacyConfigMigrated(user.id);
      const configs = await getUserConfigurations(user.id);
      res.json({
        configs: configs.map((c) => ({
          id: c.id,
          number: c.config_number,
          has_config: !!c.vpn_config,
          config: c.vpn_config,
          server_id: c.server_id,
          created_at: c.created_at,
        })),
      });
    } catch (err) {
      console.error("Configurations list error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/configurations/create", auth, async (req, res) => {
    const user = getUser(req);
    try {
      const sub = await getUserSubscription(user.id);
      const expiredAt = sub?.expired_at ? new Date(sub.expired_at) : null;
      const isActive = expiredAt ? expiredAt.getTime() > Date.now() : false;
      if (!isActive) {
        res.status(403).json({ error: "Subscription is not active" });
        return;
      }

      await ensureLegacyConfigMigrated(user.id);
      const current = await getUserConfigurations(user.id);
      if (current.some((c) => c.config_number === 2)) {
        res.status(409).json({ error: "Configuration #2 already exists" });
        return;
      }

      const server = await pickServerForSecondConfig(user.id);
      if (!server?.server_id) {
        res.status(503).json({ error: "No enabled VPN servers in DB" });
        return;
      }

      const baseUrl = getServerBaseUrl(server);
      const clientName = user.username || `tg_${user.id}_cfg2`;
      const config = await provisionVpnClient(clientName, "1y", server.server_id, baseUrl);
      await upsertUserConfiguration(user.id, 2, config, server.server_id);
      await incrementServerUserCount(server.server_id).catch(() => {});

      res.json({
        config: {
          number: 2,
          config,
          server_id: server.server_id,
        },
      });
    } catch (err) {
      console.error("Configuration create error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // ── External cron jobs (subscription reminders) ──

  app.post("/api/jobs/subscription-reminders", async (req, res) => {
    if (!remindersCronToken) {
      res.status(503).json({ error: "Reminders cron token is not configured" });
      return;
    }
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${remindersCronToken}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const bodyType = req.body?.type;
    if (bodyType !== "d3" && bodyType !== "d1") {
      res.status(400).json({ error: "Invalid reminder type. Use d3 or d1." });
      return;
    }

    try {
      const result = await runReminderJob(bodyType);
      res.json({
        ok: true,
        type: bodyType,
        timezone: remindersTimezone,
        ...result,
      });
    } catch (err) {
      console.error("Subscription reminder job failed:", err);
      res.status(500).json({ error: "Reminder job failed" });
    }
  });

  // ── YooKassa: create payment (redirect flow) ──

  const shopId = (process.env.MERCHANT_SHOP_ID ?? "").trim();
  const secretKey = (process.env.MERCHANT_KEY ?? "").trim();
  const yookassaAuth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const webappUrl = (process.env.WEBAPP_URL ?? "").trim();
  const remindersCronToken = (process.env.REMINDERS_CRON_TOKEN ?? "").trim();
  const remindersTimezone = (process.env.REMINDERS_TIMEZONE ?? "Europe/Moscow").trim();

  function getRenewalUrl(): string | null {
    if (!webappUrl) return null;
    try {
      const u = new URL(webappUrl);
      u.hash = "purchase";
      return u.toString();
    } catch {
      return null;
    }
  }

  function reminderMessageByType(type: ReminderType): string {
    return type === "d3" ? SUBSCRIPTION_REMINDER_D3 : SUBSCRIPTION_REMINDER_D1;
  }

  async function runReminderJob(type: ReminderType): Promise<{ processed: number; sent: number; failed: number; }> {
    const users = await getUsersForReminder(type, remindersTimezone);
    let sent = 0;
    let failed = 0;
    const renewalUrl = getRenewalUrl();
    for (const user of users) {
      try {
        await api.sendMessage(
          user.telegram_id,
          reminderMessageByType(type),
          {
            parse_mode: "HTML",
            ...(renewalUrl
              ? {
                  reply_markup: {
                    inline_keyboard: [[{ text: "Продлить подписку", web_app: { url: renewalUrl } }]],
                  },
                }
              : {}),
          },
        );
        await markUserNotificated(user.telegram_id, type);
        sent++;
      } catch (error) {
        failed++;
        await unmarkUserNotificated(user.telegram_id, type).catch(() => {});
        console.error(`Reminder ${type} send failed for user ${user.telegram_id}:`, error);
      }
    }
    return { processed: users.length, sent, failed };
  }

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

  app.post("/api/payments/create-payment", auth, async (req, res) => {
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

    // Atomically lock before any async work to prevent double processing
    // (webhook + polling can race into this function concurrently)
    pending.status = "succeeded";

    const userId = pending.userId;
    let config = pending.config ?? getConfig(userId) ?? undefined;
    let provisionOk = !!config;

    if (!config) {
      try {
        config = await getPrimaryConfig(userId) ?? undefined;
        if (config) {
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
        await upsertUserConfiguration(userId, 1, config, server.server_id);
        await incrementServerUserCount(server.server_id).catch(() => {});
      } catch (err) {
        console.error("VPN provisioning (status poll) failed:", err);
      }
    }

    markPaymentSucceeded(paymentId, config);

    try {
      await upsertUserSubscription(
        userId,
        pending.months,
        config,
        normalizeTelegramNickname(pending.username),
      );
    } catch (err) {
      console.error("DB upsert after payment failed:", err);
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
    } catch { /* user notification best-effort */ }

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
      } catch { /* admin notification best-effort */ }
    }
  }

  app.get("/api/payments/status/:paymentId", auth, async (req, res) => {
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
      await processSucceededPayment(paymentId);
      res.json({ ok: true });
      return;
    }

    // Fallback: payment not in local store (e.g. server restarted) — use webhook metadata
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
        config = await getPrimaryConfig(userId) ?? undefined;
        if (config) {
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
        await upsertUserConfiguration(userId, 1, config, server.server_id);
        await incrementServerUserCount(server.server_id).catch(() => {});
      } catch (err) {
        console.error("VPN provisioning after webhook failed:", err);
      }
    }

    try {
      await upsertUserSubscription(
        userId,
        months,
        config,
        normalizeTelegramNickname(username),
      );
    } catch (err) {
      console.error("DB upsert after webhook payment failed:", err);
    }

    const plan = PRICING.find((p) => p.months === months);
    const planLabel = plan?.label ?? `${months} мес.`;
    const amountStr = `${amount.toFixed(0)}₽`;
    const userTag = username && username !== `tg_${userId}` ? `@${username}` : "без @ника";

    try {
      await api.sendMessage(userId, PAYMENT_SUCCESS_USER(planLabel, amountStr, isRenewal), {
        parse_mode: "HTML",
      });
    } catch { /* best-effort */ }

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
      } catch { /* best-effort */ }
    }

    res.json({ ok: true });
  });

  // ── Internal cron: subscription reminders at 11:00 ──

  const cronTimezone = remindersTimezone || "Europe/Moscow";
  cron.schedule("0 11 * * *", async () => {
    console.log(`[cron] Reminder job started (tz: ${cronTimezone})`);
    for (const type of ["d3", "d1"] as const) {
      try {
        const result = await runReminderJob(type);
        console.log(`[cron] Reminder ${type}: processed=${result.processed}, sent=${result.sent}, failed=${result.failed}`);
      } catch (err) {
        console.error(`[cron] Reminder ${type} failed:`, err);
      }
    }
  }, { timezone: cronTimezone });
  console.log(`Subscription reminder cron scheduled at 11:00 ${cronTimezone}`);

  return app;
}
