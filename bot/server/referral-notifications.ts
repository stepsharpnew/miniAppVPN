import { type Api } from "grammy";
import { escapeHtml } from "../shared/texts";
import { type ReferralRewardParty, type ReferralRewardResult } from "./db";
import { resolveAdminChat } from "./store";

function formatPartyIdentity(party: ReferralRewardParty | null): string {
  if (!party) return "не найден";

  const parts: string[] = [`user_id: <code>${party.userId}</code>`];
  if (party.telegramId) {
    parts.push(`tg: <code>${party.telegramId}</code>`);
  }
  if (party.email) {
    parts.push(`email: <code>${escapeHtml(party.email)}</code>`);
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
      await api.sendMessage(
        reward.referrerUser.telegramId,
        `ваш промокод применен\nначислен <b>+${reward.referrerBonusMonths} месяц</b>`,
        { parse_mode: "HTML" },
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
    await api.sendMessage(
      admin.chatId,
      `🎁 <b>Реферальное начисление</b>\n\n` +
        `👤 Покупатель: ${formatPartyIdentity(reward.invitedUser)}\n` +
        `👥 Реферер: ${formatPartyIdentity(reward.referrerUser)}\n` +
        `💳 payment_id: <code>${escapeHtml(reward.paymentId)}</code>\n` +
        `📦 Начислено: приглашенному +${reward.invitedBonusMonths}, рефереру +${reward.referrerBonusMonths}\n` +
        `⭐ first-paid-conversion: <b>${reward.isFirstPaidConversion ? "true" : "false"}</b>`,
      {
        parse_mode: "HTML",
        ...(admin.topicId !== undefined ? { message_thread_id: admin.topicId } : {}),
      },
    );
  } catch (err) {
    console.error(
      "Admin referral reward notification failed:",
      { chatId: admin.chatId, topicId: admin.topicId, paymentId: reward.paymentId },
      err,
    );
  }
}
