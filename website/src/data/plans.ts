export interface PricingOption {
  months: number;
  label: string;
  price: number;
  discount: number;
}

export const PRICING: PricingOption[] = [
  { months: 1, label: "1 месяц", price: 150, discount: 0 },
  { months: 3, label: "3 месяца", price: 405, discount: 10 },
  { months: 6, label: "6 месяцев", price: 720, discount: 20 },
  { months: 12, label: "1 год", price: 1260, discount: 30 },
];

export const BRAND_NAME = "MEME VPN";

export const TELEGRAM_CHANNEL_URL = "https://t.me/MemeVPNbest";
export const TELEGRAM_BOT_URL = "https://t.me/MemeVPNbest";
