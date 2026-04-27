import { type Api } from "grammy";
import { escapeHtml } from "../shared/texts";
import { resolveAdminChat } from "./store";

function formatRuDateTime(value: string | null | undefined): string {
  if (!value) return "не было";
  return new Date(value).toLocaleString("ru-RU");
}

export interface GiftPromoAdminNotifyParams {
  userName: string;
  userTag: string;
  telegramId: number | null;
  dbUserId: string;
  code: string;
  months: number;
  oldExpiredAt: string | null | undefined;
  newExpiredAt: string;
}

export async function sendGiftPromoAdminNotification(
  api: Api,
  p: GiftPromoAdminNotifyParams,
): Promise<void> {
  const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY?.trim();
  if (!rawBuyChat) return;

  const admin = resolveAdminChat(rawBuyChat);
  const tgLine =
    p.telegramId != null ? `<code>${p.telegramId}</code>` : "нет";

  try {
    await api.sendMessage(
      admin.chatId,
      `🎟 <b>Промокод активирован</b>\n\n` +
        `👤 ${escapeHtml(p.userName)} (${escapeHtml(p.userTag)})\n` +
        `🆔 tg_id: ${tgLine} | user_id: <code>${escapeHtml(p.dbUserId)}</code>\n` +
        `🔑 Код: <code>${escapeHtml(p.code)}</code>\n` +
        `📅 Срок: +${p.months} мес.\n` +
        `🕐 Было: ${escapeHtml(formatRuDateTime(p.oldExpiredAt))}\n` +
        `🕑 Стало: ${escapeHtml(formatRuDateTime(p.newExpiredAt))}`,
      {
        parse_mode: "HTML",
        ...(admin.topicId !== undefined ? { message_thread_id: admin.topicId } : {}),
      },
    );
  } catch {
    /* best-effort */
  }
}
