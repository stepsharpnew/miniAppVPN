import "dotenv/config";
import { Bot, GrammyError, InlineKeyboard, session } from "grammy";
import { type WebAppPayload } from "../shared/plans";
import {
  BRAND_NAME,
  PURCHASE_ADMIN_TEXT,
  SUPPORT_ADMIN_HEADER,
  SUPPORT_FROM_WEBAPP_ADMIN_TEXT,
  SUPPORT_REPLY_FAILED,
  SUPPORT_REPLY_PREFIX,
} from "../shared/texts";
import {
  clearActiveDialog,
  getActiveDialog,
  getUserChatId,
  resolveAdminChat,
  saveForwardedMessage,
  setActiveDialog,
} from "./store";
import { type MemeContext, type SessionData } from "./types";

const botToken = process.env.BOT_TOKEN;
if (!botToken) throw new Error("BOT_TOKEN is not set");

const webappUrl = process.env.WEBAPP_URL ?? "";
if (!webappUrl)
  console.warn("⚠️ WEBAPP_URL не задан — кнопка Mini App не будет работать");

const bot = new Bot<MemeContext>(botToken);

const initialSession = (): SessionData => ({});
bot.use(session({ initial: initialSession }));

// /start — приветствие + кнопка открытия Mini App
bot.command("start", async (ctx) => {
  if (ctx.chat) clearActiveDialog(ctx.chat.id);

  const keyboard = new InlineKeyboard().webApp(
    `🚀 Открыть ${BRAND_NAME}`,
    webappUrl,
  );

  await ctx.reply(
    `👋 Добро пожаловать в ${BRAND_NAME}!\n\nЗдесь ты можешь:\n• Оформить подписку на VPN\n• Посмотреть инструкции по настройке\n• Связаться с поддержкой\n\nНажми кнопку ниже 👇`,
    { reply_markup: keyboard },
  );
});

// --- Mini App web_app_data ---
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
        ...(topicId !== undefined ? { message_thread_id: topicId } : {}),
      });
      if (userChatId) {
        saveForwardedMessage(chatId, sent.message_id, userChatId);
        setActiveDialog(userChatId, { chatId, topicId });
      }
      await ctx.reply(
        `✅ Заявка на «${payload.planName}» (${payload.months} мес.) отправлена!\n\n💰 Сумма: ${payload.total}₽\n\nМенеджер скоро свяжется с тобой.`,
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
    const adminText = SUPPORT_FROM_WEBAPP_ADMIN_TEXT(
      userName,
      userTag,
      userId,
      payload.message,
    );

    try {
      const sent = await ctx.api.sendMessage(chatId, adminText, {
        ...(topicId !== undefined ? { message_thread_id: topicId } : {}),
      });
      if (userChatId) {
        saveForwardedMessage(chatId, sent.message_id, userChatId);
        setActiveDialog(userChatId, { chatId, topicId });
      }
      await ctx.reply(
        "✅ Сообщение отправлено в поддержку! Менеджер скоро ответит.",
      );
    } catch (error) {
      console.error("Ошибка отправки поддержки из Mini App:", error);
      await ctx.reply("⚠️ Не удалось отправить сообщение. Попробуй позже.");
    }
  }
});

// --- Админ-чаты ---
const supportAdminChatRaw = process.env.ADMIN_CHAT_ID_SUPPORT ?? "";
const vipAdminChatRaw = process.env.ADMIN_CHAT_ID_BUY ?? "";
const adminChats = [supportAdminChatRaw, vipAdminChatRaw]
  .filter((v) => v.length > 0)
  .map((v) => resolveAdminChat(v));

// Админ → юзер: ответ на пересланное сообщение
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

    try {
      if (ctx.message.text) {
        await ctx.api.sendMessage(replyUserChatId, ctx.message.text);
      } else {
        await ctx.api.sendMessage(replyUserChatId, SUPPORT_REPLY_PREFIX);
        await ctx.api.copyMessage(
          replyUserChatId,
          ctx.chat.id,
          ctx.message.message_id,
        );
      }
    } catch (error) {
      console.error("Ошибка отправки ответа юзеру:", error);
      await ctx.reply(SUPPORT_REPLY_FAILED);
    }
  });
}

// Юзер → админ: свободный ответ при активном диалоге
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
      const header = SUPPORT_ADMIN_HEADER(userName, userTag, userId);
      const sent = await ctx.api.sendMessage(
        dialog.chatId,
        `${header}\n${ctx.message.text}`,
        topicOpts,
      );
      saveForwardedMessage(dialog.chatId, sent.message_id, userChatId);
    } else {
      const header = SUPPORT_ADMIN_HEADER(userName, userTag, userId);
      const sent = await ctx.api.sendMessage(dialog.chatId, header, topicOpts);
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

bot.catch((err) => {
  if (
    err.error instanceof GrammyError &&
    err.error.description.includes("message is not modified")
  ) {
    return;
  }
  console.error("Бот словил ошибку:", err.error);
});

bot.start();
console.log(`${BRAND_NAME} бот запущен 🚀`);
