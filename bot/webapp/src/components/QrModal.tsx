import WebApp from "@twa-dev/sdk";
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
    const dataUri =
      "data:application/octet-stream;charset=utf-8;base64," +
      btoa(unescape(encodeURIComponent(configText)));

    try {
      const a = document.createElement("a");
      a.href = dataUri;
      a.download = "meme-vpn.conf";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      WebApp.openLink(dataUri);
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
