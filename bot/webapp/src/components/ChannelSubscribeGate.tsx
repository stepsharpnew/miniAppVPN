import WebApp from "@twa-dev/sdk";
import { useCallback, useState } from "react";
import styles from "./ChannelSubscribeGate.module.css";

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
    try {
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
        <h1 className={styles.title}>Подпишитесь на канал</h1>
        <p className={styles.text}>
          Чтобы пользоваться приложением, нужна подписка на официальный канал
          MemeVPN. Это займёт пару секунд.
        </p>
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
