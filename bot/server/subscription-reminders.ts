import { schedule, type ScheduledTask } from "node-cron";
import type { Api, InlineKeyboard } from "grammy";
import {
  fetchUsersForExpiryReminderD1,
  fetchUsersForExpiryReminderD3,
  fetchUsersForExpiryExpired,
  fetchUsersForExpiryCancelled,
  markExpiryReminderD1Sent,
  markExpiryReminderD3Sent,
  markExpiryExpiredSent,
  markExpiryCancelledSent,
  markUserBlockedBot,
  type SubscriptionReminderRow,
} from "./db";
import { resolveAdminChat } from "./store";
import {
  SUBSCRIPTION_EXPIRING_D1_USER,
  SUBSCRIPTION_EXPIRING_D3_USER,
  SUBSCRIPTION_EXPIRED_GRACE_USER,
  SUBSCRIPTION_CANCELLED_USER,
  SUBSCRIPTION_REMINDER_SEND_FAIL_ADMIN,
} from "../shared/texts";
import {
  isPermanentTelegramSendFailure,
  sendErrorDetail,
  sendTelegramMessage,
  shouldRecordPermanentTelegramFailure,
} from "./telegram-outbound";

function formatExpiryMsk(iso: string): string {
  const d = new Date(iso);
  return (
    new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/Moscow",
    }).format(d) + " (МСК)"
  );
}

async function notifyAdminSendFailure(
  api: Api,
  rawBuyChat: string,
  row: SubscriptionReminderRow,
  error: unknown,
): Promise<void> {
  const nick =
    row.telegram_nickname?.replace(/^@/, "") ?? null;
  const admin = resolveAdminChat(rawBuyChat);
  const text = SUBSCRIPTION_REMINDER_SEND_FAIL_ADMIN(
    row.telegram_id,
    nick,
    sendErrorDetail(error),
  );
  try {
    await sendTelegramMessage(api, admin.chatId, text, {
      parse_mode: "HTML",
      ...(admin.topicId !== undefined
        ? { message_thread_id: admin.topicId }
        : {}),
    }, "subscriptionReminderAdminFailure");
  } catch (e) {
    console.error("subscription-reminder: admin notify failed", e);
  }
}

async function sendReminderBatch(
  api: Api,
  rows: SubscriptionReminderRow[],
  kind: "d3" | "d1" | "expired" | "cancelled",
  getRenewKeyboard: () => InlineKeyboard | undefined,
  rawBuyChat: string | undefined,
): Promise<void> {
  const mark = {
    d3: markExpiryReminderD3Sent,
    d1: markExpiryReminderD1Sent,
    expired: markExpiryExpiredSent,
    cancelled: markExpiryCancelledSent,
  }[kind];

  for (const row of rows) {
    const kb = getRenewKeyboard();
    let text: string;
    if (kind === "d3") text = SUBSCRIPTION_EXPIRING_D3_USER(formatExpiryMsk(row.expired_at));
    else if (kind === "d1") text = SUBSCRIPTION_EXPIRING_D1_USER(formatExpiryMsk(row.expired_at));
    else if (kind === "expired") text = SUBSCRIPTION_EXPIRED_GRACE_USER(formatExpiryMsk(row.expired_at));
    else text = SUBSCRIPTION_CANCELLED_USER();

    const showKeyboard = kind !== "cancelled";

    try {
      const result = await sendTelegramMessage(api, row.telegram_id, text, {
        parse_mode: "HTML",
        ...(showKeyboard && kb ? { reply_markup: kb } : {}),
      }, `subscriptionReminder:${kind}`);
      if (result.status !== "sent") continue;
      await mark(row.id);
    } catch (error) {
      if (
        shouldRecordPermanentTelegramFailure() &&
        isPermanentTelegramSendFailure(error)
      ) {
        try {
          await markUserBlockedBot(row.id);
        } catch (e) {
          console.error("markUserBlockedBot failed", row.id, e);
        }
        continue;
      }
      console.error(
        `subscription-reminder: send failed (${kind})`,
        row.telegram_id,
        error,
      );
      if (rawBuyChat?.trim()) {
        await notifyAdminSendFailure(api, rawBuyChat.trim(), row, error);
      }
    }
  }
}

export async function runSubscriptionExpiryRemindersOnce(
  api: Api,
  getRenewKeyboard: () => InlineKeyboard | undefined,
): Promise<void> {
  const rawBuyChat = process.env.ADMIN_CHAT_ID_BUY?.trim();

  const d3 = await fetchUsersForExpiryReminderD3();
  await sendReminderBatch(api, d3, "d3", getRenewKeyboard, rawBuyChat);

  const d1 = await fetchUsersForExpiryReminderD1();
  await sendReminderBatch(api, d1, "d1", getRenewKeyboard, rawBuyChat);

  // Уведомление в момент истечения — даём 2 дня на продление
  const expired = await fetchUsersForExpiryExpired();
  await sendReminderBatch(api, expired, "expired", getRenewKeyboard, rawBuyChat);

  // Финальное уведомление об отмене — грейс-период прошёл без оплаты
  const cancelled = await fetchUsersForExpiryCancelled();
  await sendReminderBatch(api, cancelled, "cancelled", getRenewKeyboard, rawBuyChat);
}

/**
 * Ежедневно в 11:00 по Москве. При рестарте/деплое catch-up в index.ts
 * компенсирует пропущенный запуск в это окно.
 */
export function scheduleSubscriptionExpiryReminders(
  api: Api,
  getRenewKeyboard: () => InlineKeyboard | undefined,
): ScheduledTask {
  return schedule(
    "0 11 * * *",
    () => {
      void runSubscriptionExpiryRemindersOnce(api, getRenewKeyboard).catch(
        (e) => console.error("subscription-reminder: job error", e),
      );
    },
    { timezone: "Europe/Moscow" },
  );
}
