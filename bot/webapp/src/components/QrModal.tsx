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

  const handleDownload = useCallback(() => {
    const blob = new Blob([configText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meme-vpn.conf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

        <div className={styles.buttons}>
          <button className={styles.downloadBtn} onClick={handleDownload}>
            📥 Скачать .conf
          </button>
          <button
            className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
            onClick={handleCopy}
          >
            {copied ? "✓ Скопировано" : "📋 Скопировать"}
          </button>
        </div>
      </div>
    </div>
  );
}
