export const BRAND_NAME = "MEME VPN";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Admin-facing: new ticket from Mini App ──

export const SUPPORT_TICKET_ADMIN = (
  userName: string,
  userTag: string,
  userId: number,
  message: string,
): string =>
  `🆕 <b>Новое обращение</b>\n\n` +
  `👤 <b>${escapeHtml(userName)}</b> · ${escapeHtml(userTag)}\n` +
  `🆔 <code>${userId}</code>\n\n` +
  `<blockquote>${escapeHtml(message)}</blockquote>\n` +
  `<i>↩️ Ответьте на это сообщение</i>`;

// ── Admin-facing: user text in active dialog ──

export const SUPPORT_USER_TEXT_ADMIN = (
  userName: string,
  userTag: string,
  userId: number,
  text: string,
): string =>
  `💬 <b>${escapeHtml(userName)}</b> · ${escapeHtml(userTag)} · <code>${userId}</code>\n\n` +
  escapeHtml(text);

// ── Admin-facing: caption for media ──

export const SUPPORT_MEDIA_CAPTION_ADMIN = (
  userName: string,
  userTag: string,
  userId: number,
  originalCaption?: string,
): string => {
  let caption = `👤 <b>${escapeHtml(userName)}</b> · ${escapeHtml(userTag)} · <code>${userId}</code>`;
  if (originalCaption) caption += `\n\n${escapeHtml(originalCaption)}`;
  return caption;
};

// ── Admin-facing: fallback header for unsupported media ──

export const SUPPORT_MEDIA_HEADER_ADMIN = (
  userName: string,
  userTag: string,
  userId: number,
): string =>
  `📎 <b>${escapeHtml(userName)}</b> · ${escapeHtml(userTag)} · <code>${userId}</code>`;

// ── User-facing: admin reply notification via bot ──

export const SUPPORT_NEW_REPLY_NOTIFICATION =
  `📨 <b>Новое сообщение от поддержки</b>\n\nОткройте чат, чтобы прочитать ответ.`;

// ── User-facing: ticket sent confirmation ──

export const SUPPORT_TICKET_SENT_USER =
  `✅ <b>Обращение отправлено!</b>\n\n` +
  `Менеджер получил ваше сообщение и скоро ответит прямо в этот чат.\n\n` +
  `📎 Вы можете отправлять <b>текст, фото и файлы</b> — всё дойдёт до менеджера.`;

export const SUPPORT_REPLY_FAILED =
  `⚠️ Не удалось отправить ответ — возможно, пользователь заблокировал бота.`;

// ── Purchase admin notification ──

export const PURCHASE_ADMIN_TEXT = (
  userName: string,
  userTag: string,
  userId: number,
  planName: string,
  months: number,
  total: number,
): string =>
  `🛒 <b>Заявка на покупку</b>\n\n` +
  `👤 <b>${escapeHtml(userName)}</b> · ${escapeHtml(userTag)}\n` +
  `🆔 <code>${userId}</code>\n\n` +
  `📦 Тариф: <b>${escapeHtml(planName)}</b>\n` +
  `🗓 Срок: ${months} мес.\n` +
  `💰 Сумма: <b>${total}₽</b>\n\n` +
  `<i>↩️ Ответьте на это сообщение</i>`;

// ── Payment notifications ──

export const PAYMENT_SUCCESS_USER = (planLabel: string, amount: string): string =>
  `✅ <b>Оплата прошла успешно!</b>\n\n` +
  `📦 Тариф: <b>${escapeHtml(planLabel)}</b>\n` +
  `💰 Сумма: <b>${amount}</b>\n\n` +
  `⏳ Подготавливаем ваш VPN-конфиг…`;

export const PAYMENT_CONFIG_SENT = `🔑 <b>Ваш конфиг готов!</b>\n\nСкопируйте текст ниже или отсканируйте QR‑код в приложении Amnezia VPN.`;

export const PAYMENT_PROVISION_FAILED_USER =
  `⚠️ Оплата прошла, но не удалось создать конфиг автоматически.\n` +
  `Менеджер получил уведомление и решит вопрос вручную.`;

export const PAYMENT_ADMIN_NOTIFY = (
  userName: string,
  userTag: string,
  userId: number,
  planLabel: string,
  amount: string,
  provisionOk: boolean,
): string =>
  `💳 <b>Успешная оплата</b>\n\n` +
  `👤 <b>${escapeHtml(userName)}</b> · ${escapeHtml(userTag)}\n` +
  `🆔 <code>${userId}</code>\n\n` +
  `📦 Тариф: <b>${escapeHtml(planLabel)}</b>\n` +
  `💰 Сумма: <b>${amount}</b>\n` +
  `🔧 Авто‑выдача: ${provisionOk ? "✅ выдан" : "❌ ошибка — требуется ручная выдача"}`;

// ── FAQ (used by Mini App) ──

export const FAQ_ITEMS = [
  {
    question: "Как получить конфиг?",
    answer:
      "После оплаты бот автоматически отправит вам ссылку на конфигурацию. Она также будет доступна в разделе «Профиль».",
    icon: "❓",
  },
  {
    question: "Как продлить подписку?",
    answer:
      "Просто оформите новую подписку в разделе «Покупка». Срок действия будет добавлен к текущему.",
    icon: "🔄",
  },
] as const;
