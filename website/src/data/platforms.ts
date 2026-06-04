export type PlatformId = "android" | "ios" | "windows" | "macos" | "linux";

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  downloadUrl: string;
  steps: string[];
  happDownloadUrl: string;
  happSteps: string[];
}

export type VpnClientKind = "amneziawg" | "happ";

export const PLATFORMS: PlatformInfo[] = [
  {
    id: "android",
    name: "Android",
    downloadUrl:
      "https://play.google.com/store/apps/details?id=org.amnezia.awg",
    steps: [
      "Скачайте AmneziaWG из Google Play по кнопке ниже",
      "Откройте AmneziaWG и выберите «Сканировать QR»",
      "Наведите камеру на QR-конфиг из личного кабинета",
      "Подтвердите импорт и нажмите «Подключиться»",
    ],
    happDownloadUrl:
      "https://play.google.com/store/apps/details?id=com.happproxy",
    happSteps: [
      "Скачайте HAPP из Google Play по кнопке ниже",
      "Скопируйте HAPP-ссылку из профиля",
      "Откройте HAPP и добавьте подписку из буфера обмена",
      "Выберите сервер и нажмите «Подключиться»",
    ],
  },
  {
    id: "ios",
    name: "iPhone / iPad",
    downloadUrl: "https://apps.apple.com/us/app/amneziawg/id6478942365",
    steps: [
      "Скачайте AmneziaWG из App Store по кнопке ниже",
      "Откройте AmneziaWG и нажмите «Сканировать QR»",
      "Наведите камеру на QR-конфиг из личного кабинета",
      "Разрешите VPN-профиль в iOS и подключитесь",
    ],
    happDownloadUrl:
      "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    happSteps: [
      "Скачайте HAPP из App Store по кнопке ниже",
      "Скопируйте HAPP-ссылку из профиля",
      "Откройте HAPP и добавьте подписку из буфера обмена",
      "Выберите сервер и нажмите «Подключиться»",
    ],
  },
  {
    id: "windows",
    name: "Windows",
    downloadUrl: "https://t.me/MemeVPNbest/14",
    steps: [
      "Скачайте установщик AmneziaWG из нашего канала по кнопке ниже",
      "Откройте программу и выберите «Импорт конфигурации»",
      "Вставьте или загрузите выданный конфиг",
      "Сохраните профиль и нажмите «Connect»",
    ],
    happDownloadUrl: "https://github.com/Happ-proxy/happ-desktop/releases/latest",
    happSteps: [
      "Скачайте HAPP для Windows по кнопке ниже",
      "Скопируйте HAPP-ссылку из профиля",
      "Откройте HAPP и добавьте подписку из буфера обмена",
      "Выберите сервер и нажмите «Подключиться»",
    ],
  },
  {
    id: "macos",
    name: "macOS",
    downloadUrl: "https://apps.apple.com/us/app/amneziawg/id6478942365",
    steps: [
      "Скачайте AmneziaWG из App Store по кнопке ниже",
      "Откройте AmneziaWG и нажмите «Сканировать QR»",
      "Наведите камеру на QR-конфиг из личного кабинета",
      "Подтвердите импорт и включите VPN",
    ],
    happDownloadUrl:
      "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    happSteps: [
      "Скачайте HAPP из App Store по кнопке ниже",
      "Скопируйте HAPP-ссылку из профиля",
      "Откройте HAPP и добавьте подписку из буфера обмена",
      "Выберите сервер и нажмите «Подключиться»",
    ],
  },
  {
    id: "linux",
    name: "Linux",
    downloadUrl: "https://github.com/amnezia-vpn/amnezia-client/releases",
    steps: [
      "Скачайте AmneziaWG под свой дистрибутив по кнопке ниже",
      "Запустите клиент и откройте «Сканировать QR»",
      "Сканируйте QR-код или загрузите конфиг",
      "Активируйте профиль и поднимите туннель",
    ],
    happDownloadUrl: "https://github.com/Happ-proxy/happ-desktop/releases/latest",
    happSteps: [
      "Скачайте HAPP для Linux по кнопке ниже",
      "Скопируйте HAPP-ссылку из профиля",
      "Откройте HAPP и добавьте подписку из буфера обмена",
      "Выберите сервер и нажмите «Подключиться»",
    ],
  },
];

export const PURCHASE_PLATFORMS = PLATFORMS.filter(
  (p) => p.id !== "macos" && p.id !== "linux",
);
