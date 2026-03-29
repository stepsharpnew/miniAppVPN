export interface PricingOption {
  months: number;
  label: string;
  price: number;
  discount: number;
  durationCode: string;
}

export const PRICING: PricingOption[] = [
  { months: 1, label: "1 месяц", price: 150, discount: 0, durationCode: "1m" },
  { months: 3, label: "3 месяца", price: 405, discount: 10, durationCode: "3m" },
  { months: 6, label: "6 месяцев", price: 720, discount: 20, durationCode: "6m" },
  { months: 12, label: "1 год", price: 1260, discount: 30, durationCode: "12m" },
];

export function monthsLabel(n: number): string {
  if (n === 1) return "1 месяц";
  if (n >= 2 && n <= 4) return `${n} месяца`;
  return `${n} месяцев`;
}

/** Payload that Mini App sends to the bot via sendData(). */
export interface WebAppPurchasePayload {
  type: "purchase";
  planName: string;
  months: number;
  total: number;
}

export interface WebAppSupportPayload {
  type: "support";
  message: string;
}

export type WebAppPayload = WebAppPurchasePayload | WebAppSupportPayload;

/** Metadata attached to YooKassa payment for webhook/status resolution. */
export interface PaymentMetadata {
  telegram_user_id: string;
  username: string;
  first_name: string;
  months: string;
  duration_code: string;
  is_renewal: string;
}

export interface ChatMessage {
  id: string;
  from: "user" | "support";
  type: "text" | "photo" | "document";
  text?: string;
  fileId?: string;
  fileName?: string;
  timestamp: number;
}
