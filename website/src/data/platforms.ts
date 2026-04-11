export type PlatformId = "android" | "ios" | "windows" | "macos" | "linux";

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  downloadUrl: string;
  steps: string[];
}

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
  },
];

export const PURCHASE_PLATFORMS = PLATFORMS.filter(
  (p) => p.id !== "macos" && p.id !== "linux",
);
