import WebApp from "@twa-dev/sdk";

/**
 * В некоторых WebView (в т.ч. Telegram Android) initData появляется не в нулевой тик —
 * если сразу сделать fetch с WebApp.initData, заголовок может не отправиться → 401 Unauthorized.
 */
export async function waitForTelegramInitData(
  timeoutMs = 8000,
  intervalMs = 50,
): Promise<string | null> {
  const first = WebApp.initData?.trim();
  if (first) return first;

  return new Promise((resolve) => {
    const started = Date.now();
    const id = window.setInterval(() => {
      const v = WebApp.initData?.trim();
      if (v) {
        window.clearInterval(id);
        resolve(v);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(id);
        resolve(null);
      }
    }, intervalMs);
  });
}
