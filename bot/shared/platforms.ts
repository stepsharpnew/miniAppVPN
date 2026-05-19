export type PlatformId = 'android' | 'ios' | 'windows' | 'macos' | 'linux';

export type VpnClientKind = 'amneziawg' | 'happ';

export interface ClientVariant {
  downloadUrl: string;
  steps: string[];
  botText: string;
}

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  icon: string;
  /** Primary variant (AmneziaWG) — kept as top-level fields for backward compat */
  downloadUrl: string;
  steps: string[];
  botText: string;
  /** All client variants keyed by kind */
  variants: Record<VpnClientKind, ClientVariant>;
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
    variants: {
      amneziawg: {
        downloadUrl: 'https://play.google.com/store/apps/details?id=org.amnezia.awg',
        steps: [
          'Скачайте AmneziaWG из Google Play по кнопке ниже',
          'Откройте AmneziaWG и выберите «Сканировать QR»',
          'Наведите камеру на QR-конфиг из раздела «Профиль»',
          'Подтвердите импорт и нажмите «Подключиться»',
        ],
        botText: `🤖 Android | AmneziaWG

• Скачиваем AmneziaWG из Google Play.
• Сканируем QR-конфиг из раздела «Профиль».
• Подтверждаем импорт и жмем «Подключиться».`,
      },
      happ: {
        downloadUrl: 'https://play.google.com/store/apps/details?id=app.happ.vpn',
        steps: [
          'Скачайте HAPP из Google Play по кнопке ниже',
          'Откройте HAPP и нажмите «+» → «Добавить подписку»',
          'Введите или отсканируйте QR-код подписки из раздела «Профиль»',
          'Выберите сервер и нажмите «Подключиться»',
        ],
        botText: `🤖 Android | HAPP (VLESS)

• Скачиваем HAPP из Google Play.
• Нажимаем «+» → «Добавить подписку».
• Вводим или сканируем QR ссылки из раздела «Профиль».
• Выбираем сервер и жмем «Подключиться».`,
      },
    },
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
    variants: {
      amneziawg: {
        downloadUrl: 'https://apps.apple.com/us/app/amneziawg/id6478942365',
        steps: [
          'Скачайте AmneziaWG из App Store по кнопке ниже',
          'Откройте AmneziaWG и нажмите «Сканировать QR»',
          'Наведите камеру на QR-конфиг из раздела «Профиль»',
          'Разрешите VPN-профиль в iOS и подключитесь',
        ],
        botText: `🍎 iPhone | AmneziaWG

• Скачиваем AmneziaWG из App Store.
• Сканируем QR-конфиг из раздела «Профиль».
• Разрешаем VPN-профиль и подключаемся.`,
      },
      happ: {
        downloadUrl: 'https://apps.apple.com/app/happ-vpn/id6446476622',
        steps: [
          'Скачайте HAPP из App Store по кнопке ниже',
          'Откройте HAPP и нажмите «+» → «Добавить подписку»',
          'Введите или отсканируйте QR-код подписки из раздела «Профиль»',
          'Выберите сервер и нажмите «Подключиться»',
        ],
        botText: `🍎 iPhone | HAPP (VLESS)

• Скачиваем HAPP из App Store.
• Нажимаем «+» → «Добавить подписку».
• Вводим или сканируем QR ссылки из раздела «Профиль».
• Выбираем сервер и жмем «Подключиться».`,
      },
    },
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
    variants: {
      amneziawg: {
        downloadUrl: 'https://t.me/MemeVPNbest/14',
        steps: [
          'Скачайте установщик AmneziaWG из нашего канала по кнопке ниже',
          'Откройте программу и выберите «Импорт конфигурации»',
          'Вставьте или загрузите выданный конфиг из раздела «Профиль»',
          'Сохраните профиль и нажмите «Connect»',
        ],
        botText: `🪟 Windows | AmneziaWG

• Скачиваем AmneziaWG из канала.
• Импортируем .conf файл из раздела «Профиль».
• Жмем «Connect».`,
      },
      happ: {
        downloadUrl: 'https://github.com/hiddify/hiddify-next/releases/latest',
        steps: [
          'Скачайте Hiddify (HAPP-совместимый клиент) по кнопке ниже',
          'Откройте приложение и нажмите «+» → «Добавить из буфера»',
          'Вставьте ссылку подписки из раздела «Профиль»',
          'Нажмите «Подключиться»',
        ],
        botText: `🪟 Windows | HAPP / Hiddify (VLESS)

• Скачиваем Hiddify.
• Добавляем ссылку подписки из раздела «Профиль».
• Жмем «Подключиться».`,
      },
    },
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
    variants: {
      amneziawg: {
        downloadUrl: 'https://apps.apple.com/us/app/amneziawg/id6478942365',
        steps: [
          'Скачайте AmneziaWG из App Store по кнопке ниже',
          'Откройте AmneziaWG и нажмите «Сканировать QR»',
          'Наведите камеру на QR-конфиг из раздела «Профиль»',
          'Подтвердите импорт и включите VPN',
        ],
        botText: `🍏 macOS | AmneziaWG

• Скачиваем AmneziaWG из App Store.
• Сканируем QR-конфиг.
• Включаем VPN.`,
      },
      happ: {
        downloadUrl: 'https://github.com/hiddify/hiddify-next/releases/latest',
        steps: [
          'Скачайте Hiddify (HAPP-совместимый клиент) по кнопке ниже',
          'Откройте приложение и нажмите «+» → «Добавить из буфера»',
          'Вставьте ссылку подписки из раздела «Профиль»',
          'Нажмите «Подключиться»',
        ],
        botText: `🍏 macOS | HAPP / Hiddify (VLESS)

• Скачиваем Hiddify.
• Добавляем ссылку подписки из раздела «Профиль».
• Жмем «Подключиться».`,
      },
    },
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
    variants: {
      amneziawg: {
        downloadUrl: 'https://github.com/amnezia-vpn/amnezia-client/releases',
        steps: [
          'Скачайте AmneziaWG под свой дистрибутив по кнопке ниже',
          'Запустите клиент и откройте «Сканировать QR»',
          'Сканируйте QR-код (или загрузите скрин QR)',
          'Активируйте профиль и поднимите туннель',
        ],
        botText: `🐧 Linux | AmneziaWG

• Скачиваем AmneziaWG под свой дистрибутив.
• Сканируем QR или импортируем конфиг.
• Поднимаем туннель.`,
      },
      happ: {
        downloadUrl: 'https://github.com/hiddify/hiddify-next/releases/latest',
        steps: [
          'Скачайте Hiddify (HAPP-совместимый клиент) по кнопке ниже',
          'Запустите приложение и нажмите «+» → «Добавить из буфера»',
          'Вставьте ссылку подписки из раздела «Профиль»',
          'Нажмите «Подключиться»',
        ],
        botText: `🐧 Linux | HAPP / Hiddify (VLESS)

• Скачиваем Hiddify.
• Добавляем ссылку подписки из раздела «Профиль».
• Жмем «Подключиться».`,
      },
    },
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
