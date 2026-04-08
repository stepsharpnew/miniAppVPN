import WebApp from "@twa-dev/sdk";
import { useCallback, useState } from "react";
import { Player } from "@lottiefiles/react-lottie-player";
import styles from "./ChannelSubscribeGate.module.css";
import shieldAnim from "../assets/Shield lock 3D rotation Lottie JSON animation.json";
import { waitForTelegramInitData } from "../utils/telegramInitData";

interface ChannelSubscribeGateProps {
  channelUrl: string;
  onRecheck: () => Promise<void>;
}

export function ChannelSubscribeGate({
  channelUrl,
  onRecheck,
}: ChannelSubscribeGateProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notSeen, setNotSeen] = useState(false);

  const openChannel = useCallback(() => {
    setErr(null);
    try {
      WebApp.openTelegramLink(channelUrl);
    } catch {
      window.open(channelUrl, "_blank", "noopener,noreferrer");
    }
  }, [channelUrl]);

  const recheck = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setNotSeen(false);
    try {
      const initData = await waitForTelegramInitData();
      if (!initData) throw new Error("missing initData");

      const r = await fetch("/api/channel-subscription", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      const data = (r.ok ? await r.json() : null) as
        | { subscribed?: boolean }
        | null;
      const subscribed = Boolean(data?.subscribed);
      if (!subscribed) {
        setNotSeen(true);
        try {
          WebApp.HapticFeedback.notificationOccurred("warning");
        } catch {
          /* ok */
        }
        return;
      }

      await onRecheck();
    } catch {
      setErr("Не удалось проверить подписку. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [onRecheck]);

  return (
    <div className={styles.overlay}>
      <div className={`${styles.blob} ${styles.blob1}`} aria-hidden />
      <div className={`${styles.blob} ${styles.blob2}`} aria-hidden />
      <div className={styles.content}>
        <div className={styles.anim} aria-hidden>
          <Player
            autoplay
            loop
            src={shieldAnim as unknown as object}
            style={{ width: 160, height: 160 }}
          />
        </div>
        <h1 className={styles.title}>Подпишитесь на канал</h1>
        <p className={styles.text}>
          Чтобы пользоваться приложением, нужна подписка на официальный канал
          MemeVPN. Это займёт пару секунд.
        </p>
        {notSeen ? (
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-live="polite"
          >
            <div className={styles.modalTitle}>Мы вас не видим</div>
            <div className={styles.modalText}>
              Подписка ещё не подтвердилась. Иногда Telegram обновляет статус с
              задержкой. Подождите 5–10 секунд и нажмите «Я подписался» ещё раз.
            </div>
            <button
              type="button"
              className={styles.modalBtn}
              onClick={() => setNotSeen(false)}
            >
              Понятно
            </button>
          </div>
        ) : null}
        {err ? <p className={styles.err}>{err}</p> : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={openChannel}
          >
            Открыть канал
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={recheck}
            disabled={busy}
          >
            {busy ? "Проверка…" : "Я подписался"}
          </button>
        </div>
      </div>
    </div>
  );
}
