export const BRAND_NAME = 'MEME VPN';

export const SUPPORT_BOT_USERNAME = 'YOUR_SUPPORT_BOT';

export const SUPPORT_ADMIN_HEADER = (
  userName: string,
  userTag: string,
  userId: number,
): string =>
  `📨 Обращение в поддержку\n\n👤 От: ${userName}\n🔖 Ник: ${userTag}\n🆔 ID: ${userId}\n\n📝 Сообщение:`;

export const SUPPORT_REPLY_PREFIX = '📨 Ответ от менеджера:\n\n';

export const SUPPORT_REPLY_FAILED =
  '⚠️ Не удалось отправить ответ — возможно, пользователь заблокировал бота.';

export const PURCHASE_ADMIN_TEXT = (
  userName: string,
  userTag: string,
  userId: number,
  planName: string,
  months: number,
  total: number,
): string => `🛒 Заявка на покупку

👤 От: ${userName}
🔖 Ник: ${userTag}
🆔 ID: ${userId}

📦 Тариф: ${planName}
🗓 Срок: ${months} мес.
💰 Сумма: ${total}₽`;

export const SUPPORT_FROM_WEBAPP_ADMIN_TEXT = (
  userName: string,
  userTag: string,
  userId: number,
  message: string,
): string => `📨 Обращение из Mini App

👤 От: ${userName}
🔖 Ник: ${userTag}
🆔 ID: ${userId}

📝 Сообщение:
${message}`;

export const FAQ_ITEMS = [
  {
    question: 'Как получить конфиг?',
    answer: 'После оплаты бот автоматически отправит вам ссылку на конфигурацию. Она также будет доступна в разделе «Профиль».',
    icon: '❓',
  },
  {
    question: 'Сколько устройств можно подключить?',
    answer: 'Количество устройств зависит от выбранного тарифа: Персональная — 1, Дуо — 2, Семейная — до 6 устройств.',
    icon: '📱',
  },
  {
    question: 'Как продлить подписку?',
    answer: 'Просто оформите новую подписку в разделе «Покупка». Срок действия будет добавлен к текущему.',
    icon: '🔄',
  },
] as const;
