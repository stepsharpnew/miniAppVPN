import { type Api } from "grammy";
import { escapeHtml } from "../shared/texts";
import { type ReferralRewardParty, type ReferralRewardResult } from "./db";
import { resolveAdminChat } from "./store";
import { sendTelegramMessage } from "./telegram-outbound";

function formatPartyIdentity(party: ReferralRewardParty | null): string {
  if (!party) return "не найден";

  const parts: string[] = [`user_id: <code>${party.userId}</code>`];
  if (party.telegramId) {
    parts.push(`tg: <code>${party.telegramId}</code>`);
  }
  if (party.login) {
    parts.push(`login: <code>${escapeHtml(party.login)}</code>`);
  }
  return parts.join(" | ");
}

export async function sendReferralRewardNotifications(
  api: Api,
  reward: ReferralRewardResult,
): Promise<void> {
  if (!reward.applied || !reward.invitedUser || !reward.referrerUser) {
    return;
  }

  if (reward.isFirstPaidConversion && reward.referrerUser.telegramId) {
    try {
      await sendTelegramMessage(
        api,
        reward.referrerUser.telegramId,
        `ваш реферальный код сработал 🎁\nначислено <b>+${reward.referrerBonusDays} дней</b>`,
        { parse_mode: "HTML" },
        "referralRewardUserNotification",
      );
    } catch (err) {
      console.error(
        "Referrer reward notification failed:",
        reward.referrerUser.telegramId,
        err,
      );
    }
  }

  const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY?.trim();
  if (!rawBuyChat) {
    return;
  }

  const admin = resolveAdminChat(rawBuyChat);
  try {
    await sendTelegramMessage(
      api,
      admin.chatId,
      `🎁 <b>Реферальное начисление</b>\n\n` +
        `👤 Покупатель: ${formatPartyIdentity(reward.invitedUser)}\n` +
        `👥 Реферер: ${formatPartyIdentity(reward.referrerUser)}\n` +
        `💳 payment_id: <code>${escapeHtml(reward.paymentId)}</code>\n` +
        `📦 Начислено: приглашенному +${reward.invitedBonusDays} дн., рефереру +${reward.referrerBonusDays} дн.\n` +
        `⭐ first-paid-conversion: <b>${reward.isFirstPaidConversion ? "true" : "false"}</b>`,
      {
        parse_mode: "HTML",
        ...(admin.topicId !== undefined ? { message_thread_id: admin.topicId } : {}),
      },
      "referralRewardAdminNotification",
    );
  } catch (err) {
    console.error(
      "Admin referral reward notification failed:",
      { chatId: admin.chatId, topicId: admin.topicId, paymentId: reward.paymentId },
      err,
    );
  }
}
