import WebApp from "@twa-dev/sdk";
import { useCallback, useState } from "react";
import styles from "./QrModal.module.css";

interface QrModalProps {
  qrDataUrl: string;
  onClose: () => void;
}

export function QrModal({ qrDataUrl, onClose }: QrModalProps) {
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

        <h2 className={styles.title}>Ваш VPN конфиг</h2>
        <p className={styles.subtitle}>
          Отсканируйте QR-код в приложении AmneziaWG
        </p>

        <img
          src={qrDataUrl}
          alt="QR код конфигурации"
          className={styles.qrImage}
        />

        <button
          className={`${styles.downloadBtn} ${sent ? styles.sent : ""}`}
          onClick={sent ? undefined : handleSendFile}
        >
          {sending ? "Отправляем..." : sent ? "✓ Файл отправлен в чат" : "📥 Скачать .conf"}
        </button>
      </div>
    </div>
  );
}
