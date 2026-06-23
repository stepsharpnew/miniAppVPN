import { GrammyError, type Api } from "grammy";

export type TelegramOutboundMode = "live" | "whitelist" | "dry-run" | "off";

export type TelegramOutboundResult<T> =
  | { status: "sent"; value: T }
  | { status: "skipped"; reason: string };

type SendMessageOptions = Parameters<Api["sendMessage"]>[2];
type SendPhotoInput = Parameters<Api["sendPhoto"]>[1];
type SendPhotoOptions = Parameters<Api["sendPhoto"]>[2];
type SendDocumentInput = Parameters<Api["sendDocument"]>[1];
type SendDocumentOptions = Parameters<Api["sendDocument"]>[2];
type CopyMessageOptions = Parameters<Api["copyMessage"]>[3];

const VALID_OUTBOUND_MODES = new Set<TelegramOutboundMode>([
  "live",
  "whitelist",
  "dry-run",
  "off",
]);

const TELEGRAM_BOT_TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g;

function normalizedAppEnv(): string {
  return (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development")
    .trim()
    .toLowerCase();
}

export function getAppEnv(): string {
  return normalizedAppEnv();
}

export function isProductionAppEnv(): boolean {
  return normalizedAppEnv() === "production";
}

export function getTelegramOutboundMode(): TelegramOutboundMode {
  const raw = (process.env.TELEGRAM_OUTBOUND_MODE ?? "").trim().toLowerCase();
  if (VALID_OUTBOUND_MODES.has(raw as TelegramOutboundMode)) {
    return raw as TelegramOutboundMode;
  }
  return isProductionAppEnv() ? "live" : "whitelist";
}

export function getTelegramOutboundAllowlist(): Set<string> {
  const raw = process.env.TELEGRAM_OUTBOUND_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function targetKey(chatId: number | string): string {
  return String(chatId).trim();
}

export function canProcessIncomingTelegramChat(chatId: number | string): boolean {
  const mode = getTelegramOutboundMode();
  if (mode === "live") return true;
  if (mode === "off" || mode === "dry-run") return false;
  return getTelegramOutboundAllowlist().has(targetKey(chatId));
}

function evaluateTelegramOutbound(chatId: number | string): { ok: true } | { ok: false; reason: string } {
  const mode = getTelegramOutboundMode();
  if (mode === "live") return { ok: true };
  if (mode === "off") return { ok: false, reason: "outbound disabled" };
  if (mode === "dry-run") return { ok: false, reason: "dry-run" };

  const allowlist = getTelegramOutboundAllowlist();
  if (allowlist.size === 0) {
    return { ok: false, reason: "whitelist is empty" };
  }
  if (!allowlist.has(targetKey(chatId))) {
    return { ok: false, reason: "target is not whitelisted" };
  }
  return { ok: true };
}

export function shouldAutorunSubscriptionReminders(): boolean {
  const raw = process.env.SUBSCRIPTION_REMINDERS_AUTORUN;
  if (raw !== undefined) {
    return /^(1|true|yes|on)$/i.test(raw.trim());
  }
  return isProductionAppEnv();
}

export function isPermanentTelegramSendFailure(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  if (error.error_code === 403) return true;
  return error.error_code === 400 && /chat not found/i.test(error.description);
}

export function shouldRecordPermanentTelegramFailure(): boolean {
  return isProductionAppEnv() && getTelegramOutboundMode() === "live";
}

export function sendErrorDetail(error: unknown): string {
  if (error instanceof GrammyError) {
    return `${error.error_code}: ${error.description}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

async function runTelegramOutbound<T>(
  chatId: number | string,
  operation: string,
  send: () => Promise<T>,
): Promise<TelegramOutboundResult<T>> {
  const decision = evaluateTelegramOutbound(chatId);
  if (!decision.ok) {
    console.info(
      `telegram-outbound: skipped ${operation} to ${targetKey(chatId)} (${getTelegramOutboundMode()}: ${decision.reason})`,
    );
    return { status: "skipped", reason: decision.reason };
  }
  return { status: "sent", value: await send() };
}

export function sendTelegramMessage(
  api: Api,
  chatId: number | string,
  text: string,
  options?: SendMessageOptions,
  operation = "sendMessage",
) {
  return runTelegramOutbound(chatId, operation, () =>
    api.sendMessage(chatId, text, options),
  );
}

export function sendTelegramPhoto(
  api: Api,
  chatId: number | string,
  photo: SendPhotoInput,
  options?: SendPhotoOptions,
  operation = "sendPhoto",
) {
  return runTelegramOutbound(chatId, operation, () =>
    api.sendPhoto(chatId, photo, options),
  );
}

export function sendTelegramDocument(
  api: Api,
  chatId: number | string,
  document: SendDocumentInput,
  options?: SendDocumentOptions,
  operation = "sendDocument",
) {
  return runTelegramOutbound(chatId, operation, () =>
    api.sendDocument(chatId, document, options),
  );
}

export function copyTelegramMessage(
  api: Api,
  chatId: number | string,
  fromChatId: number | string,
  messageId: number,
  options?: CopyMessageOptions,
  operation = "copyMessage",
) {
  return runTelegramOutbound(chatId, operation, () =>
    api.copyMessage(chatId, fromChatId, messageId, options),
  );
}

function redactTelegramTokens(value: string): string {
  let redacted = value.replace(TELEGRAM_BOT_TOKEN_RE, "bot<redacted>");
  const token = process.env.BOT_TOKEN?.trim();
  if (token) {
    redacted = redacted.split(token).join("<telegram-token-redacted>");
  }
  return redacted;
}

function redactLogArg(arg: unknown, depth = 0): unknown {
  if (typeof arg === "string") return redactTelegramTokens(arg);
  if (arg instanceof Error) {
    const redacted = new Error(redactTelegramTokens(arg.message));
    redacted.name = arg.name;
    redacted.stack = arg.stack ? redactTelegramTokens(arg.stack) : undefined;
    if (depth < 2) {
      for (const [key, value] of Object.entries(arg)) {
        (redacted as any)[key] = redactLogArg(value, depth + 1);
      }
    }
    return redacted;
  }
  if (!arg || typeof arg !== "object" || depth >= 3) return arg;
  if (Array.isArray(arg)) return arg.map((item) => redactLogArg(item, depth + 1));
  return Object.fromEntries(
    Object.entries(arg).map(([key, value]) => [key, redactLogArg(value, depth + 1)]),
  );
}

export function installTelegramLogRedaction(): void {
  const globalConsole = console as typeof console & { __telegramRedactionInstalled?: boolean };
  if (globalConsole.__telegramRedactionInstalled) return;
  globalConsole.__telegramRedactionInstalled = true;

  for (const level of ["error", "warn", "log", "info"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args.map((arg) => redactLogArg(arg)));
    };
  }
}
