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
  `<i>${escapeHtml(message)}</i>\n`;

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

export const SUPPORT_NEW_REPLY_NOTIFICATION = `📨 <b>Новое сообщение от поддержки</b>\n\nОткройте чат, чтобы прочитать ответ.`;

// ── User-facing: ticket sent confirmation ──

export const SUPPORT_TICKET_SENT_USER =
  `✅ <b>Обращение отправлено!</b>\n\n` +
  `Менеджер получил ваше сообщение и скоро ответит прямо в этот чат.\n\n` +
  `📎 Вы можете отправлять <b>текст, фото и файлы</b> — всё дойдёт до менеджера.`;

export const SUPPORT_REPLY_FAILED = `⚠️ Не удалось отправить ответ — возможно, пользователь заблокировал бота.`;

// ── Подписка: напоминания перед окончанием (cron) ──

export function SUBSCRIPTION_EXPIRING_D3_USER(expiresMsk: string): string {
  return (
    `⏳ <b>Подписка скоро закончится</b>\n\n` +
    `До окончания текущего периода осталось <b>3 дня</b> ` +
    `(окончание: <b>${escapeHtml(expiresMsk)}</b>).\n\n` +
    `Продлите подписку в приложении, чтобы не потерять доступ.`
  );
}

export function SUBSCRIPTION_EXPIRING_D1_USER(expiresMsk: string): string {
  return (
    `⚠️ <b>Подписка заканчивается завтра</b>\n\n` +
    `Окончание: <b>${escapeHtml(expiresMsk)}</b>.\n\n` +
    `Оформите новую подписку заранее — так вы не останетесь без VPN.`
  );
}

export function SUBSCRIPTION_EXPIRED_GRACE_USER(expiresMsk: string): string {
  return (
    `🔴 <b>Срок подписки истёк</b>\n\n` +
    `Ваша подписка закончилась <b>${escapeHtml(expiresMsk)}</b>.\n\n` +
    `Мы даём вам <b>2 дня</b> на продление — VPN продолжит работать в течение этого времени. ` +
    `Пожалуйста, продлите подписку, чтобы не потерять доступ.`
  );
}

export function SUBSCRIPTION_CANCELLED_USER(): string {
  return (
    `❌ <b>Подписка отменена</b>\n\n` +
    `К сожалению, период ожидания истёк и ваша подписка была отменена.\n\n` +
    `Вы можете оформить новую подписку в любой момент — доступ к VPN будет восстановлен сразу после оплаты.`
  );
}

export function SUBSCRIPTION_REMINDER_SEND_FAIL_ADMIN(
  telegramId: number,
  nickname: string | null,
  detail: string,
): string {
  const nick =
    nickname && nickname.length > 0 ? escapeHtml(`@${nickname}`) : "без @ника";
  return (
    `📭 <b>Не удалось отправить напоминание о подписке</b>\n\n` +
    `🆔 <code>${telegramId}</code> · ${nick}\n` +
    `${escapeHtml(detail)}`
  );
}

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

export const PAYMENT_SUCCESS_USER = (
  planLabel: string,
  amount: string,
  isRenewal = false,
): string =>
  isRenewal
    ? `✅ <b>Подписка успешно продлена!</b>\n\n` +
      `📦 Тариф: <b>${escapeHtml(planLabel)}</b>\n` +
      `💰 Сумма: <b>${amount}</b>`
    : `✅ <b>Оплата прошла успешно!</b>\n\n` +
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
  userId: number | string,
  planLabel: string,
  amount: string,
  provisionOk: boolean,
  isRenewal = false,
): string =>
  `💳 <b>${isRenewal ? "Продление подписки" : "Успешная оплата"}</b>\n\n` +
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
      "Перейдите в раздел «Покупка» и выберите тариф. Срок действия будет добавлен к текущему.",
    icon: "🔄",
  },
  {
    question: "Включил VPN, но ничего не работает",
    answer:
      "После первого включения VPN полностью закройте Telegram (смахните из списка недавних приложений) и откройте снова.",
    icon: "📱",
  },
] as const;
