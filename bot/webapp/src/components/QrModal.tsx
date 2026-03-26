import WebApp from "@twa-dev/sdk";
import { useCallback, useState } from "react";
import styles from "./QrModal.module.css";

interface QrModalProps {
  qrDataUrl: string;
  configText: string;
  onClose: () => void;
}

export function QrModal({ qrDataUrl, configText, onClose }: QrModalProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      // Get one-time download token from backend
      const res = await fetch("/api/payments/config/download-token", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": WebApp.initData },
      });

      if (!res.ok) throw new Error("token failed");

      const { token } = await res.json();
      const url = `${window.location.origin}/api/payments/config/download/${token}`;

      // Open in system browser — reliable file download
      WebApp.openLink(url, { try_instant_view: false });
    } catch {
      // Fallback: Blob URL for browsers that support it
      try {
        const blob = new Blob([configText], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "meme-vpn.conf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        WebApp.showAlert("Не удалось скачать конфиг. Попробуйте из профиля.");
      }
    } finally {
      setDownloading(false);
    }
  }, [configText, downloading]);

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

        <button className={styles.downloadBtn} onClick={handleDownload}>
          {downloading ? "Загрузка..." : "📥 Скачать .conf"}
        </button>
      </div>
    </div>
  );
}
