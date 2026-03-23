import { useCallback, useState } from "react";
import styles from "./QrModal.module.css";

interface QrModalProps {
  qrDataUrl: string;
  configText: string;
  onClose: () => void;
}

export function QrModal({ qrDataUrl, configText, onClose }: QrModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(configText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [configText]);

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
          className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
          onClick={handleCopy}
        >
          {copied ? "✓ Скопировано" : "📋 Скопировать конфиг"}
        </button>
      </div>
    </div>
  );
}
