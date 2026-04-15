import crypto from "crypto";

export type OtpPurpose = "sync" | "reset";

interface OtpEntry {
  code: string;
  email: string;
  purpose: OtpPurpose;
  telegramId?: number;
  attempts: number;
  verified: boolean;
  verifyToken?: string;
  createdAt: number;
  lastAttemptAt: number;
}

const store = new Map<string, OtpEntry>();

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const ATTEMPT_COOLDOWN_MS = 30 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_CODES_PER_EMAIL_PER_HOUR = 6;

const sendHistory = new Map<string, number[]>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.createdAt > CODE_TTL_MS) store.delete(key);
  }
}

function storeKey(email: string, purpose: OtpPurpose): string {
  return `${purpose}:${email}`;
}

function generateCode(): string {
  return String(crypto.randomInt(10000, 100000));
}

function checkRateLimit(email: string): string | null {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  const history = sendHistory.get(email) ?? [];
  const recent = history.filter((t) => t > hourAgo);
  sendHistory.set(email, recent);

  if (recent.length >= MAX_CODES_PER_EMAIL_PER_HOUR) {
    return "Слишком много запросов. Попробуйте через час";
  }

  if (recent.length > 0 && now - recent[recent.length - 1] < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil(
      (RESEND_COOLDOWN_MS - (now - recent[recent.length - 1])) / 1000,
    );
    return `Подождите ${waitSec} сек. перед повторной отправкой`;
  }

  return null;
}

export interface CreateOtpResult {
  code: string;
}

export function createOtp(
  email: string,
  purpose: OtpPurpose,
  telegramId?: number,
): CreateOtpResult | { error: string } {
  evictExpired();

  const rateLimitError = checkRateLimit(email);
  if (rateLimitError) return { error: rateLimitError };

  const code = generateCode();
  const key = storeKey(email, purpose);

  store.set(key, {
    code,
    email,
    purpose,
    telegramId,
    attempts: 0,
    verified: false,
    createdAt: Date.now(),
    lastAttemptAt: 0,
  });

  const history = sendHistory.get(email) ?? [];
  history.push(Date.now());
  sendHistory.set(email, history);

  return { code };
}

export interface VerifyOtpResult {
  verified: true;
  verifyToken: string;
}

export function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string,
): VerifyOtpResult | { error: string } {
  evictExpired();

  const key = storeKey(email, purpose);
  const entry = store.get(key);

  if (!entry) {
    return { error: "Код не найден или истёк. Запросите новый" };
  }

  if (entry.verified) {
    return { error: "Код уже использован. Запросите новый" };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(key);
    return { error: "Превышено количество попыток. Запросите новый код" };
  }

  const now = Date.now();
  if (entry.lastAttemptAt > 0 && now - entry.lastAttemptAt < ATTEMPT_COOLDOWN_MS) {
    const waitSec = Math.ceil(
      (ATTEMPT_COOLDOWN_MS - (now - entry.lastAttemptAt)) / 1000,
    );
    return { error: `Подождите ${waitSec} сек. перед следующей попыткой` };
  }

  entry.attempts++;
  entry.lastAttemptAt = now;

  if (entry.code !== code) {
    const remaining = MAX_ATTEMPTS - entry.attempts;
    if (remaining <= 0) {
      store.delete(key);
      return { error: "Превышено количество попыток. Запросите новый код" };
    }
    return { error: `Неверный код. Осталось попыток: ${remaining}` };
  }

  entry.verified = true;
  const verifyToken = crypto.randomUUID();
  entry.verifyToken = verifyToken;

  return { verified: true, verifyToken };
}

export function consumeVerifyToken(
  email: string,
  purpose: OtpPurpose,
  token: string,
): boolean {
  const key = storeKey(email, purpose);
  const entry = store.get(key);

  if (!entry || !entry.verified || entry.verifyToken !== token) {
    return false;
  }

  store.delete(key);
  return true;
}
