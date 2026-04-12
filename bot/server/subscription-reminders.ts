import { schedule, type ScheduledTask } from "node-cron";
import type { Api, InlineKeyboard } from "grammy";
import { GrammyError } from "grammy";
import {
  fetchUsersForExpiryReminderD1,
  fetchUsersForExpiryReminderD3,
  markExpiryReminderD1Sent,
  markExpiryReminderD3Sent,
  type SubscriptionReminderRow,
} from "./db";
import { resolveAdminChat } from "./store";
import {
  SUBSCRIPTION_EXPIRING_D1_USER,
  SUBSCRIPTION_EXPIRING_D3_USER,
  SUBSCRIPTION_REMINDER_SEND_FAIL_ADMIN,
} from "../shared/texts";

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

function sendErrorDetail(error: unknown): string {
  if (error instanceof GrammyError) {
    return `${error.error_code}: ${error.description}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
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
    await api.sendMessage(admin.chatId, text, {
      parse_mode: "HTML",
      ...(admin.topicId !== undefined
        ? { message_thread_id: admin.topicId }
        : {}),
    });
  } catch (e) {
    console.error("subscription-reminder: admin notify failed", e);
  }
}

async function sendReminderBatch(
  api: Api,
  rows: SubscriptionReminderRow[],
  kind: "d3" | "d1",
  getRenewKeyboard: () => InlineKeyboard | undefined,
  rawBuyChat: string | undefined,
): Promise<void> {
  const body =
    kind === "d3" ? SUBSCRIPTION_EXPIRING_D3_USER : SUBSCRIPTION_EXPIRING_D1_USER;
  const mark =
    kind === "d3" ? markExpiryReminderD3Sent : markExpiryReminderD1Sent;

  for (const row of rows) {
    const kb = getRenewKeyboard();
    try {
      await api.sendMessage(row.telegram_id, body(formatExpiryMsk(row.expired_at)), {
        parse_mode: "HTML",
        ...(kb ? { reply_markup: kb } : {}),
      });
      await mark(row.id);
    } catch (error) {
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
}

/**
 * Ежедневно в 11:00 по Москве — напоминания о скором окончании подписки.
 * Возвращает задачу cron для остановки при shutdown.
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
