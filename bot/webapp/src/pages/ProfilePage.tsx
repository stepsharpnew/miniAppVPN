import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { BRAND_NAME } from "../../../shared/texts";
import { useVpnConfig } from "../hooks/useVpnConfig";
import styles from "./ProfilePage.module.css";

interface SubscriptionInfo {
  active: boolean;
  expired_at: string | null;
  config?: string | null;
  happ_subscription_url?: string | null;
}

function buildHappDeepLink(subscriptionUrl: string): string {
  return `happ://add/${subscriptionUrl}`;
}

export function ProfilePage() {
  const { config: localConfig, save: saveLocalConfig } = useVpnConfig();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [happCopied, setHappCopied] = useState(false);
  const [clientKind, setClientKind] = useState<"happ" | "amneziawg">("amneziawg");

  useEffect(() => {
    let alive = true;
    fetch("/api/subscription", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        if (data) {
          setSub(data);
          if (data.config) saveLocalConfig(data.config);
        } else {
          setSub({ active: false, expired_at: null, config: null });
        }
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setSub({ active: false, expired_at: null, config: null });
          setLoaded(true);
        }
      });
    return () => { alive = false; };
  }, []);

  const activeConfig = sub?.config ?? (sub?.active ? localConfig : null);
  const happUrl = sub?.happ_subscription_url ?? null;

  useEffect(() => {
    let alive = true;
    if (!activeConfig) { setQrDataUrl(null); return; }
    QRCode.toDataURL(activeConfig, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((dataUrl) => { if (alive) setQrDataUrl(dataUrl); })
      .catch(() => { if (alive) setQrDataUrl(null); });
    return () => { alive = false; };
  }, [activeConfig]);

  const handleSendFile = useCallback(async () => {
    if (sending || !activeConfig) return;
    setSending(true);
    try {
      const res = await fetch("/api/payments/config/send-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ config: activeConfig }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSent(true);
    } catch {
      WebApp.showAlert("Не удалось отправить файл. Попробуйте позже.");
    } finally {
      setSending(false);
    }
  }, [sending, activeConfig]);

  const handleCopyHappUrl = useCallback(async () => {
    if (!happUrl) return;
    try {
      await navigator.clipboard.writeText(happUrl);
      setHappCopied(true);
      window.setTimeout(() => setHappCopied(false), 2000);
    } catch {
      WebApp.showAlert("Не удалось скопировать ссылку.");
    }
  }, [happUrl]);

  const handleOpenHapp = useCallback(() => {
    if (!happUrl) return;
    void navigator.clipboard.writeText(happUrl).then(() => {
      setHappCopied(true);
      window.setTimeout(() => setHappCopied(false), 2000);
    }).catch(() => {});
  }, [happUrl]);

  return (
    <div className={styles.page}>
      <div className={styles.configCard}>
        <div className={styles.kindToggleWrap}>
          <div className={styles.kindToggleLabel}>Клиент VPN</div>
          <div className={styles.kindToggle}>
            <button
              type="button"
              className={`${styles.kindTab} ${clientKind === "amneziawg" ? styles.kindTabActive : ""}`}
              onClick={() => setClientKind("amneziawg")}
            >
              AmneziaWG
            </button>
            <button
              type="button"
              className={`${styles.kindTab} ${clientKind === "happ" ? styles.kindTabActive : ""}`}
              onClick={() => setClientKind("happ")}
            >
              HAPP
            </button>
          </div>
        </div>

        {!loaded ? (
          <div className={styles.noConfig}>Загрузка...</div>
        ) : clientKind === "happ" ? (
          sub?.active && happUrl ? (
            <>
              <div className={styles.happUrlRow}>
                <input
                  className={styles.happUrlInput}
                  readOnly
                  value={happUrl}
                  onFocus={(e) => e.target.select()}
                />
                <button className={styles.secondaryBtn} onClick={handleCopyHappUrl}>
                  {happCopied ? "Скопировано" : "Копировать"}
                </button>
              </div>
              <a
                className={styles.happOpenBtn}
                href={buildHappDeepLink(happUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenHapp}
              >
                Открыть в HAPP
              </a>
              <div className={styles.configHint}>
                Подписка добавится автоматически. Если HAPP не открылся —
                ссылка уже в буфере, откройте приложение и подтвердите импорт.
              </div>
            </>
          ) : (
            <div className={styles.noConfig}>
              После оплаты ссылка на HAPP-подписку появится здесь.
            </div>
          )
        ) : sub?.active && activeConfig && qrDataUrl ? (
          <>
            <img src={qrDataUrl} alt="QR код конфигурации" className={styles.qr} />
            <button
              className={`${styles.sendBtn} ${sent ? styles.sent : ""}`}
              onClick={sent ? undefined : handleSendFile}
            >
              {sending ? "Отправляем..." : sent ? "✓ Файл отправлен в чат" : "📄 Получить .conf файлом"}
            </button>
          </>
        ) : (
          <div className={styles.noConfig}>
            После оплаты конфиг появится здесь и в чате с ботом {BRAND_NAME}.
          </div>
        )}
      </div>
    </div>
  );
}
