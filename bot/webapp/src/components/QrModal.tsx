import WebApp from "@twa-dev/sdk";
import { useCallback, useState } from "react";
import type { PlatformInfo } from "../../../shared/platforms";
import { PlatformLogo } from "./PlatformLogo";
import styles from "./QrModal.module.css";

interface QrModalProps {
  qrDataUrl: string;
  platform?: PlatformInfo | null;
  onClose: () => void;
}

export function QrModal({ qrDataUrl, platform, onClose }: QrModalProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendFile = useCallback(async () => {
    if (sending) return;
    setSending(true);

    try {
      const res = await fetch("/api/payments/config/send-file", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": WebApp.initData },
      });

      if (!res.ok) throw new Error(`${res.status}`);

      setSent(true);
    } catch {
      WebApp.showAlert("Не удалось отправить файл. Попробуйте позже.");
    } finally {
      setSending(false);
    }
  }, [sending]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          ✕
        </button>

        <h2 className={styles.title}>VPN конфиг готов!</h2>
        <p className={styles.subtitle}>
          Отсканируйте QR-код в приложении AmneziaWG
        </p>

        <img
          src={qrDataUrl}
          alt="QR код конфигурации"
          className={styles.qrImage}
        />

        {platform && (
          <div className={styles.instructions}>
            <div className={styles.instructionsHeader}>
              <span className={styles.instructionsIcon} aria-hidden>
                <PlatformLogo platformId={platform.id} size={22} className={styles.platformLogo} />
              </span>
              <span className={styles.instructionsTitle}>
                Что делать ({platform.name})
              </span>
            </div>

            <div className={styles.stepsList}>
              {platform.steps.map((step, i) => (
                <div key={i} className={styles.step}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <span className={styles.stepText}>{step}</span>
                </div>
              ))}
            </div>

            <a
              href={platform.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.appBtn}
              onClick={(e) => {
                e.preventDefault();
                WebApp.openLink(platform.downloadUrl, { try_instant_view: false });
              }}
            >
              📥 Скачать AmneziaWG
            </a>
          </div>
        )}

        <button
          className={`${styles.downloadBtn} ${sent ? styles.sent : ""}`}
          onClick={sent ? undefined : handleSendFile}
        >
          {sending
            ? "Отправляем..."
            : sent
              ? "✓ Файл отправлен в чат"
              : "📄 Получить .conf файлом"}
        </button>
      </div>
    </div>
  );
}
