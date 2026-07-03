import crypto from "crypto";
import rateLimit from "express-rate-limit";

/** YooKassa payment id (UUID v4). */
export const PAYMENT_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidPaymentId(s: string): boolean {
  return typeof s === "string" && PAYMENT_ID_REGEX.test(s);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, "hex");
    bufB = Buffer.from(b, "hex");
  } catch {
    return false;
  }
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getCorsAllowedOrigins(): string[] {
  const raw = [
    process.env.WEBAPP_URL,
    process.env.WEB_SITE_URL,
    process.env.CORS_EXTRA_ORIGINS,
  ]
    .filter(Boolean)
    .join(",");

  const origins = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      /* skip invalid */
    }
  }
  return [...origins];
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов. Попробуйте позже." },
});

export const promoRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Попробуйте позже." },
});

export const paymentCreateRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток оплаты. Попробуйте позже." },
});

export const healthzRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: "too many requests",
});

export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const CHANNEL_CACHE_TTL_MS = 60_000;
const channelMemberCache = new Map<
  number,
  { subscribed: boolean; expiresAt: number }
>();

export function getCachedChannelMembership(userId: number): boolean | null {
  const entry = channelMemberCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    channelMemberCache.delete(userId);
    return null;
  }
  return entry.subscribed;
}

export function setCachedChannelMembership(
  userId: number,
  subscribed: boolean,
): void {
  channelMemberCache.set(userId, {
    subscribed,
    expiresAt: Date.now() + CHANNEL_CACHE_TTL_MS,
  });
}

/** MIME types allowed for support uploads (client-declared type is not trusted alone). */
export const SUPPORT_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
]);

export function isAllowedSupportUploadMime(mimetype: string): boolean {
  return SUPPORT_UPLOAD_MIME.has(mimetype.toLowerCase());
}
