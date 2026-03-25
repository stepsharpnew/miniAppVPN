import "dotenv/config";
import { Bot, GrammyError, InlineKeyboard, session } from "grammy";
import { type InvoicePayload, PRICING, type WebAppPayload, monthsLabel } from "../shared/plans";
import {
  BRAND_NAME,
  escapeHtml,
  PAYMENT_ADMIN_NOTIFY,
  PAYMENT_CONFIG_SENT,
  PAYMENT_PROVISION_FAILED_USER,
  PAYMENT_SUCCESS_USER,
  PURCHASE_ADMIN_TEXT,
  SUPPORT_MEDIA_CAPTION_ADMIN,
  SUPPORT_MEDIA_HEADER_ADMIN,
  SUPPORT_NEW_REPLY_NOTIFICATION,
  SUPPORT_REPLY_FAILED,
  SUPPORT_TICKET_ADMIN,
  SUPPORT_TICKET_SENT_USER,
  SUPPORT_USER_TEXT_ADMIN,
} from "../shared/texts";
import { saveConfig } from "./config-store";
import { provisionVpnClient } from "./vpn";
import {
  clearActiveDialog,
  getActiveDialog,
  getUserChatId,
  resolveAdminChat,
  saveForwardedMessage,
  setActiveDialog,
} from "./store";
import { addMessage } from "./chat-store";
import { createApiServer } from "./api";
import { type MemeContext, type SessionData } from "./types";

const botToken = (process.env.BOT_TOKEN ?? "").trim();
if (!botToken) throw new Error("BOT_TOKEN is not set");

const webappUrl = (process.env.WEBAPP_URL ?? "").trim();

/** Telegram принимает web_app-кнопку только с валидным https:// URL; иначе sendMessage падает без ответа пользователю. */
function resolvedMiniAppUrl(): string | undefined {
  if (!webappUrl) return undefined;
  try {
    const u = new URL(webappUrl);
    if (u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

const miniAppHttpsUrl = resolvedMiniAppUrl();
if (!webappUrl) {
  console.warn("⚠️ WEBAPP_URL не задан — кнопка Mini App не будет работать");
} else if (!miniAppHttpsUrl) {
  console.warn(
    "⚠️ WEBAPP_URL должен быть полным https:// URL (как в BotFather), иначе Telegram отклонит кнопку приложения",
  );
}

const paymentToken = (process.env.PAYMENT_TOKEN ?? "").trim();
if (!paymentToken) {
  console.warn("⚠️ PAYMENT_TOKEN не задан — оплата через Telegram Payments не будет работать");
}

const apiPort = parseInt(process.env.API_PORT ?? "3001", 10);

const bot = new Bot<MemeContext>(botToken);

const initialSession = (): SessionData => ({});
bot.use(session({ initial: initialSession }));

function webAppKeyboard(buttonText: string) {
  const url = resolvedMiniAppUrl();
  if (!url) return undefined;
  return new InlineKeyboard().webApp(buttonText, url);
}

// ────────────────── /start ──────────────────

bot.command("start", async (ctx) => {
  if (ctx.chat) clearActiveDialog(ctx.chat.id);

  const openKb = webAppKeyboard(`🚀 Открыть ${BRAND_NAME}`);
  let text =
    `👋 Добро пожаловать в <b>${BRAND_NAME}</b>!\n\n` +
    `Здесь ты можешь:\n` +
    `• Оформить подписку на VPN\n` +
    `• Посмотреть инструкции по настройке\n` +
    `• Связаться с поддержкой\n\n`;

  if (openKb) {
    text += "Нажми кнопку ниже 👇";
  } else {
    text +=
      "⚠️ Кнопка приложения сейчас недоступна: укажи в настройках бота переменную <code>WEBAPP_URL</code> — полный адрес Mini App с <b>https://</b> (тот же, что в BotFather → Bot Settings → Menu Button).";
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    ...(openKb ? { reply_markup: openKb } : {}),
  });
});

// ────────────────── Telegram Payments: pre_checkout_query ──────────────────
// MUST be registered before any generic `message` handler — Telegram gives only
// 10 seconds to answer; if we don't, the payment fails.

bot.on("pre_checkout_query", async (ctx) => {
  try {
    const raw = ctx.preCheckoutQuery.invoice_payload;
    const payload: InvoicePayload = JSON.parse(raw);
    if (payload.type !== "vpn") {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "Неизвестный тип товара",
      });
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  } catch {
    await ctx.answerPreCheckoutQuery(false, {
      error_message: "Ошибка проверки заказа",
    });
  }
});

// ────────────────── Telegram Payments: successful_payment ──────────────────

bot.on("message:successful_payment", async (ctx) => {
  const sp = ctx.message!.successful_payment!;
  const userId = ctx.from!.id;
  const userName = ctx.from?.first_name ?? "Аноним";
  const userTag = ctx.from?.username ? `@${ctx.from.username}` : "без @ника";

  let payload: InvoicePayload;
  try {
    payload = JSON.parse(sp.invoice_payload) as InvoicePayload;
  } catch {
    console.error("Невалидный payload в successful_payment:", sp.invoice_payload);
    return;
  }

  const plan = PRICING.find((p) => p.months === payload.months);
  const planLabel = plan?.label ?? monthsLabel(payload.months);
  const amountStr = `${(sp.total_amount / 100).toFixed(0)}₽`;

  await ctx.reply(PAYMENT_SUCCESS_USER(planLabel, amountStr), {
    parse_mode: "HTML",
  });

  let provisionOk = false;

  try {
    const clientName = ctx.from?.username ?? `tg_${userId}`;
    const config = await provisionVpnClient(clientName, payload.dc);
    provisionOk = true;
    saveConfig(userId, config);
  } catch (err) {
    console.error("VPN provisioning after payment failed:", err);
  }

  const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY;
  if (rawBuyChat) {
    const admin = resolveAdminChat(rawBuyChat);
    try {
      await ctx.api.sendMessage(
        admin.chatId,
        PAYMENT_ADMIN_NOTIFY(userName, userTag, userId, planLabel, amountStr, provisionOk),
        {
          parse_mode: "HTML",
          ...(admin.topicId !== undefined ? { message_thread_id: admin.topicId } : {}),
        },
      );
    } catch (e) {
      console.error("Не удалось уведомить админа об оплате:", e);
    }
  }
});

// ────────────────── Mini App web_app_data ──────────────────

bot.on("message:web_app_data", async (ctx) => {
  let payload: WebAppPayload;
  try {
    payload = JSON.parse(ctx.message.web_app_data.data) as WebAppPayload;
  } catch {
    console.error(
      "Невалидный JSON из Mini App:",
      ctx.message.web_app_data.data,
    );
    return;
  }

  const userName = ctx.from?.first_name ?? "Аноним";
  const userTag = ctx.from?.username ? `@${ctx.from.username}` : "без @ника";
  const userId = ctx.from?.id ?? 0;
  const userChatId = ctx.chat?.id;

  if (payload.type === "purchase") {
    const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY;
    if (!rawBuyChat) {
      await ctx.reply("⚠️ Не удалось отправить заявку. Попробуй позже.");
      return;
    }

    const { chatId, topicId } = resolveAdminChat(rawBuyChat);
    const adminText = PURCHASE_ADMIN_TEXT(
      userName,
      userTag,
      userId,
      payload.planName,
      payload.months,
      payload.total,
    );

    try {
      const sent = await ctx.api.sendMessage(chatId, adminText, {
        parse_mode: "HTML",
        ...(topicId !== undefined ? { message_thread_id: topicId } : {}),
      });
      if (userChatId) {
        saveForwardedMessage(chatId, sent.message_id, userChatId);
        setActiveDialog(userChatId, { chatId, topicId });
      }
      await ctx.reply(
        `✅ Заявка на «<b>${escapeHtml(payload.planName)}</b>» ` +
          `(${payload.months} мес.) отправлена!\n\n` +
          `💰 Сумма: <b>${payload.total}₽</b>\n\n` +
          `Менеджер скоро свяжется с тобой.`,
        { parse_mode: "HTML" },
      );
    } catch (error) {
      console.error("Ошибка отправки заявки из Mini App:", error);
      await ctx.reply("⚠️ Не удалось отправить заявку. Попробуй позже.");
    }
  } else if (payload.type === "support") {
    const rawSupportChat = process.env.ADMIN_CHAT_ID_SUPPORT;
    if (!rawSupportChat) {
      await ctx.reply("⚠️ Не удалось отправить сообщение. Попробуй позже.");
      return;
    }

    const { chatId, topicId } = resolveAdminChat(rawSupportChat);
    const adminText = SUPPORT_TICKET_ADMIN(
      userName,
      userTag,
      userId,
      payload.message,
    );

    try {
      const sent = await ctx.api.sendMessage(chatId, adminText, {
        parse_mode: "HTML",
        ...(topicId !== undefined ? { message_thread_id: topicId } : {}),
      });
      if (userChatId) {
        saveForwardedMessage(chatId, sent.message_id, userChatId);
        setActiveDialog(userChatId, { chatId, topicId });
        addMessage(userChatId, {
          from: "user",
          type: "text",
          text: payload.message,
        });
      }
      await ctx.reply(SUPPORT_TICKET_SENT_USER, { parse_mode: "HTML" });
    } catch (error) {
      console.error("Ошибка отправки поддержки из Mini App:", error);
      await ctx.reply("⚠️ Не удалось отправить сообщение. Попробуй позже.");
    }
  }
});

// ────────────────── Admin → User ──────────────────

const supportAdminChatRaw = process.env.ADMIN_CHAT_ID_SUPPORT ?? "";
const vipAdminChatRaw = process.env.ADMIN_CHAT_ID_BUY ?? "";
const adminChats = [supportAdminChatRaw, vipAdminChatRaw]
  .filter((v) => v.length > 0)
  .map((v) => resolveAdminChat(v));

if (adminChats.length > 0) {
  bot.on("message", async (ctx, next) => {
    const chatIdStr = ctx.chat.id.toString();
    const threadId = ctx.message.message_thread_id;

    const currentAdminChat = adminChats.find((ac) => {
      if (ac.chatId !== chatIdStr) return false;
      if (ac.topicId !== undefined) return ac.topicId === threadId;
      return threadId === undefined;
    });
    if (!currentAdminChat) return next();

    const repliedTo = ctx.message.reply_to_message;
    if (!repliedTo) return next();

    const replyUserChatId = getUserChatId(
      currentAdminChat.chatId,
      repliedTo.message_id,
    );
    if (!replyUserChatId) return next();

    setActiveDialog(replyUserChatId, currentAdminChat);

    // Store admin reply in chat store (Mini App reads via polling)
    if (ctx.message.text) {
      addMessage(replyUserChatId, {
        from: "support",
        type: "text",
        text: ctx.message.text,
      });
    } else if (ctx.message.photo && ctx.message.photo.length > 0) {
      addMessage(replyUserChatId, {
        from: "support",
        type: "photo",
        fileId: ctx.message.photo[ctx.message.photo.length - 1].file_id,
        text: ctx.message.caption,
      });
    } else if (ctx.message.document) {
      addMessage(replyUserChatId, {
        from: "support",
        type: "document",
        fileId: ctx.message.document.file_id,
        fileName: ctx.message.document.file_name,
        text: ctx.message.caption,
      });
    }

    // Send notification to user via bot message
    try {
      const keyboard = webAppKeyboard("💬 Открыть чат");
      await ctx.api.sendMessage(replyUserChatId, SUPPORT_NEW_REPLY_NOTIFICATION, {
        parse_mode: "HTML",
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
    } catch (error) {
      console.error("Ошибка отправки уведомления:", error);
      await ctx.reply(SUPPORT_REPLY_FAILED);
    }
  });
}

// ────────────────── User → Admin (fallback: direct bot messages) ──────────────────

bot.on("message", async (ctx) => {
  const userChatId = ctx.chat.id;
  const dialog = getActiveDialog(userChatId);
  if (!dialog) return;

  const userName = ctx.from?.first_name ?? "Аноним";
  const userTag = ctx.from?.username ? `@${ctx.from.username}` : "без @ника";
  const userId = ctx.from?.id ?? 0;
  const topicOpts =
    dialog.topicId !== undefined ? { message_thread_id: dialog.topicId } : {};

  try {
    if (ctx.message.text) {
      const text = SUPPORT_USER_TEXT_ADMIN(
        userName,
        userTag,
        userId,
        ctx.message.text,
      );
      const sent = await ctx.api.sendMessage(dialog.chatId, text, {
        parse_mode: "HTML",
        ...topicOpts,
      });
      saveForwardedMessage(dialog.chatId, sent.message_id, userChatId);
      addMessage(userChatId, {
        from: "user",
        type: "text",
        text: ctx.message.text,
      });
    } else if (ctx.message.photo && ctx.message.photo.length > 0) {
      const fileId =
        ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const caption = SUPPORT_MEDIA_CAPTION_ADMIN(
        userName,
        userTag,
        userId,
        ctx.message.caption,
      );
      const sent = await ctx.api.sendPhoto(dialog.chatId, fileId, {
        caption,
        parse_mode: "HTML",
        ...topicOpts,
      });
      saveForwardedMessage(dialog.chatId, sent.message_id, userChatId);
      addMessage(userChatId, {
        from: "user",
        type: "photo",
        text: ctx.message.caption,
      });
    } else if (ctx.message.document) {
      const caption = SUPPORT_MEDIA_CAPTION_ADMIN(
        userName,
        userTag,
        userId,
        ctx.message.caption,
      );
      const sent = await ctx.api.sendDocument(
        dialog.chatId,
        ctx.message.document.file_id,
        { caption, parse_mode: "HTML", ...topicOpts },
      );
      saveForwardedMessage(dialog.chatId, sent.message_id, userChatId);
      addMessage(userChatId, {
        from: "user",
        type: "document",
        fileName: ctx.message.document.file_name,
        text: ctx.message.caption,
      });
    } else {
      const header = SUPPORT_MEDIA_HEADER_ADMIN(userName, userTag, userId);
      const sent = await ctx.api.sendMessage(dialog.chatId, header, {
        parse_mode: "HTML",
        ...topicOpts,
      });
      saveForwardedMessage(dialog.chatId, sent.message_id, userChatId);
      const copied = await ctx.api.copyMessage(
        dialog.chatId,
        userChatId,
        ctx.message.message_id,
        topicOpts,
      );
      saveForwardedMessage(dialog.chatId, copied.message_id, userChatId);
    }
  } catch (error) {
    console.error("Ошибка пересылки ответа юзера в админ-чат:", error);
  }
});

// ────────────────── Error handler ──────────────────

bot.catch((err) => {
  if (
    err.error instanceof GrammyError &&
    err.error.description.includes("message is not modified")
  ) {
    return;
  }
  console.error("Бот словил ошибку:", err.error);
});

// ────────────────── Start ──────────────────

const apiServer = createApiServer(bot.api, botToken);

void (async () => {
  try {
    await bot.api.getMe();
  } catch (e) {
    if (e instanceof GrammyError && e.error_code === 401) {
      console.error(
        "Telegram вернул 401: BOT_TOKEN неверный или отозван. Проверь токен в @BotFather, что в .env нет кавычек и лишних пробелов, и что compose подключает тот же env к сервису bot.",
      );
      process.exit(1);
    }
    throw e;
  }

  apiServer.listen(apiPort, () => {
    console.log(`API сервер запущен на порту ${apiPort}`);
  });

  const url = resolvedMiniAppUrl();
  if (url) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: {
          type: "web_app",
          text: `Открыть ${BRAND_NAME}`,
          web_app: { url },
        },
      });
    } catch (e) {
      console.warn("Не удалось установить кнопку меню Mini App:", e);
    }
  }

  try {
    await bot.api.setMyCommands([
      { command: "start", description: "О сервисе и запуск приложения" },
    ]);
  } catch (e) {
    console.warn("Не удалось установить команды бота:", e);
  }

  await bot.start();
  console.log(`${BRAND_NAME} бот запущен 🚀`);
})();
