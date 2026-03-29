export type PlatformId = 'android' | 'ios' | 'windows' | 'macos' | 'linux';

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  icon: string;
  downloadUrl: string;
  steps: string[];
  botText: string;
}

export const PLATFORMS: PlatformInfo[] = [
  {
    id: 'android',
    name: 'Android',
    icon: '🤖',
    downloadUrl: 'https://play.google.com/store/apps/details?id=org.amnezia.awg',
    steps: [
      'Скачайте AmneziaWG из Google Play по кнопке ниже',
      'Откройте AmneziaWG и выберите «Сканировать QR»',
      'Наведите камеру на QR-конфиг из раздела «Профиль»',
      'Подтвердите импорт и нажмите «Подключиться»',
    ],
    botText: `🤖 Android | Быстрый гайд без боли

⚡ Что делаем:
• Скачиваем AmneziaWG по кнопке ниже.
• Открываем AmneziaWG и выбираем «Сканировать QR».
• Наводим камеру на QR-конфиг.
• Подтверждаем импорт и жмем «Подключиться».

✅ Готово: если ключик зеленый — ты в домике.`,
  },
  {
    id: 'ios',
    name: 'iPhone / iPad',
    icon: '🍎',
    downloadUrl: 'https://apps.apple.com/us/app/amneziawg/id6478942365',
    steps: [
      'Скачайте AmneziaWG из App Store по кнопке ниже',
      'Откройте AmneziaWG и нажмите «Сканировать QR»',
      'Наведите камеру на QR-конфиг из раздела «Профиль»',
      'Разрешите VPN-профиль в iOS и подключитесь',
    ],
    botText: `🍎 iPhone | Гайд для эстетов

⚡ Что делаем:
• Скачиваем AmneziaWG из App Store.
• Открываем AmneziaWG и жмем «Scan QR / Сканировать QR».
• Наводим камеру на QR-конфиг.
• Разрешаем VPN-профиль в iOS и подключаемся.

✅ Готово: Safari летает, блоки плачут.`,
  },
  {
    id: 'windows',
    name: 'Windows',
    icon: '🪟',
    downloadUrl: 'https://t.me/MemeVPNbest/14',
    steps: [
      'Скачайте установщик AmneziaWG из нашего канала по кнопке ниже',
      'Откройте программу и выберите «Импорт конфигурации»',
      'Вставьте или загрузите выданный конфиг из раздела «Профиль»',
      'Сохраните профиль и нажмите «Connect»',
    ],
    botText: `🪟 Windows | Нормальный человеческий путь

⚡ Что делаем:
• Скачиваем AmneziaWG из канала (пост с установщиком).
• Открываем программу и выбираем «Импорт конфигурации».
• Вставляем/загружаем выданный конфиг (без QR).
• Сохраняем профиль и жмем «Connect».

✅ Готово: интернет снова как в 2012, но лучше.`,
  },
  {
    id: 'macos',
    name: 'macOS',
    icon: '🍏',
    downloadUrl: 'https://apps.apple.com/us/app/amneziawg/id6478942365',
    steps: [
      'Скачайте AmneziaWG из App Store по кнопке ниже',
      'Откройте AmneziaWG и нажмите «Сканировать QR»',
      'Наведите камеру на QR-конфиг из раздела «Профиль»',
      'Подтвердите импорт и включите VPN',
    ],
    botText: `🍏 macOS | Как на iPhone

⚡ Что делаем:
• Скачиваем AmneziaWG из App Store.
• Открываем AmneziaWG и жмем «Сканировать QR».
• Наводим камеру на QR-конфиг.
• Подтверждаем импорт и включаем VPN.

✅ Готово: соединение чистое, дзен достигнут.`,
  },
  {
    id: 'linux',
    name: 'Linux',
    icon: '🐧',
    downloadUrl: 'https://github.com/amnezia-vpn/amnezia-client/releases',
    steps: [
      'Скачайте AmneziaWG под свой дистрибутив по кнопке ниже',
      'Запустите клиент и откройте «Сканировать QR»',
      'Сканируйте QR-код (или загрузите скрин QR)',
      'Активируйте профиль и поднимите туннель',
    ],
    botText: `🐧 Linux | Режим техношамана

⚡ Что делаем:
• Скачиваем AmneziaWG под свой дистрибутив.
• Запускаем клиент и открываем «Сканировать QR».
• Сканируем QR-код (или загружаем скрин QR, если так удобнее).
• Активируем профиль и поднимаем туннель.

✅ Готово: пинг приятный, душа спокойна.`,
  },
];

/** Выбор устройства при покупке: без macOS/Linux (они остаются в разделе «Инструкции»). */
export const PURCHASE_PLATFORMS: PlatformInfo[] = PLATFORMS.filter(
  (p) => p.id !== 'macos' && p.id !== 'linux',
);

export const PLATFORM_DOWNLOAD_LINKS: Record<PlatformId, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.downloadUrl])
) as Record<PlatformId, string>;

export const PLATFORM_BOT_TEXTS: Record<PlatformId, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.botText])
) as Record<PlatformId, string>;
