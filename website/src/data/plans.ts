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

export const FAQ_ITEMS = [
  {
    question: "Как получить конфиг?",
    answer:
      "После оплаты вы автоматически получите конфигурацию. Она также будет доступна в личном кабинете.",
    icon: "❓",
  },
  {
    question: "Как продлить подписку?",
    answer:
      "Перейдите в раздел «Тарифы» и выберите план. Срок действия будет добавлен к текущему.",
    icon: "🔄",
  },
  {
    question: "Включил VPN, но ничего не работает",
    answer:
      "После первого включения VPN полностью закройте браузер и откройте снова. Если проблема остаётся — обратитесь в поддержку.",
    icon: "📱",
  },
] as const;
