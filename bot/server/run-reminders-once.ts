/**
 * Разовый прогон напоминаний об окончании подписки (без ожидания 11:00 по cron).
 *
 * Запуск из папки bot:
 *   npm run bot:reminders-once
 *
 * Условия в БД для окна «3 дня»: expired_at между NOW()+1d и NOW()+3d, is_notificated_d3 = false.
 * Для «1 дня»: expired_at <= NOW()+1d, is_notificated_d1 = false.
 */
import path from "path";
import { config as loadEnv } from "dotenv";
import { Bot, InlineKeyboard } from "grammy";

// При `npm run` из `bot/` сначала корень репозитория (`../.env`), затем `bot/.env` перекрывает ключи
const parentEnv = path.resolve(process.cwd(), "..", ".env");
const cwdEnv = path.resolve(process.cwd(), ".env");
loadEnv({ path: parentEnv });
loadEnv({ path: cwdEnv, override: true });
import { closeDb, initDb } from "./db";
import { runSubscriptionExpiryRemindersOnce } from "./subscription-reminders";

function resolvedMiniAppUrl(): string | undefined {
  const webappUrl = (process.env.WEBAPP_URL ?? "").trim();
  if (!webappUrl) return undefined;
  try {
    const u = new URL(webappUrl);
    if (u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function webAppKeyboard(buttonText: string, opts?: { hash?: string }) {
  const url = resolvedMiniAppUrl();
  if (!url) return undefined;
  let openUrl = url;
  if (opts?.hash) {
    const u = new URL(url);
    const h = opts.hash.startsWith("#") ? opts.hash.slice(1) : opts.hash;
    u.hash = h;
    openUrl = u.toString();
  }
  return new InlineKeyboard().webApp(buttonText, openUrl);
}

void (async () => {
  const token = (process.env.BOT_TOKEN ?? "").trim();
  if (!token) {
    console.error("BOT_TOKEN не задан");
    process.exit(1);
  }

  try {
    await initDb();
  } catch (e) {
    console.error("PostgreSQL:", e);
    process.exit(1);
  }

  const bot = new Bot(token);
  try {
    await bot.api.getMe();
  } catch (e) {
    console.error("Telegram API:", e);
    await closeDb();
    process.exit(1);
  }

  console.log("Запуск runSubscriptionExpiryRemindersOnce…");
  try {
    await runSubscriptionExpiryRemindersOnce(bot.api, () =>
      webAppKeyboard("🛒 Продлить подписку", { hash: "purchase" }),
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
  console.log("Готово.");
  process.exit(process.exitCode ?? 0);
})();
