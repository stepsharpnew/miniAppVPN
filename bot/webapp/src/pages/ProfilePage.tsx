import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { BRAND_NAME } from "../../../shared/texts";
import { StatusBadge } from "../components/StatusBadge";
import { useTelegramUser } from "../hooks/useTelegramUser";
import { useVpnConfig } from "../hooks/useVpnConfig";
import styles from "./ProfilePage.module.css";

interface SubscriptionInfo {
  active: boolean;
  expired_at: string | null;
  is_blocked?: boolean;
  is_vip?: boolean;
  config?: string | null;
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return "Истекла";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 30) {
    const months = Math.floor(days / 30);
    const rem = days % 30;
    return rem > 0 ? `${months} мес. ${rem} дн.` : `${months} мес.`;
  }
  if (days > 0) return `${days} дн.`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours} ч.`;
}

interface ProfilePageProps {
  onOpenSync?: () => void;
}

export function ProfilePage({ onOpenSync }: ProfilePageProps) {
  const user = useTelegramUser();
  const { config: localConfig, save: saveLocalConfig } = useVpnConfig();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  useEffect(() => {
    let alive = true;
    if (!activeConfig) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(activeConfig, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((dataUrl) => {
        if (alive) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (alive) setQrDataUrl(null);
      });
    return () => {
      alive = false;
    };
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

  return (
    <div className={styles.page}>
      <div className={styles.profileCard}>
        <div className={styles.profileTop}>
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.firstName}
              className={styles.avatar}
            />
          ) : (
            <div className={`${styles.avatar} ${styles.avatarPlaceholder}`}>
              {user.firstName.charAt(0)}
            </div>
          )}

          <div className={styles.profileMeta}>
            <div className={styles.userName}>
              {user.firstName} {user.lastName}
            </div>
            <div className={styles.userId}>ID: {user.id || "—"}</div>
          </div>

          <div className={styles.statusWrap}>
            <div className={styles.statusLabel}>Подписка</div>
            <StatusBadge active={sub?.active ?? false} />
            {sub?.active && sub.expired_at && (
              <div className={styles.expiryInfo}>
                {formatExpiry(sub.expired_at)}
              </div>
            )}
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.configBlock}>
          <div className={styles.sectionHeader}>VPN конфиг</div>

          {!loaded ? (
            <div className={styles.noConfig}>Загрузка...</div>
          ) : sub?.active && activeConfig && qrDataUrl ? (
            <>
              <img
                src={qrDataUrl}
                alt="QR код конфигурации"
                className={styles.qr}
              />

              <button
                className={`${styles.sendBtn} ${sent ? styles.sent : ""}`}
                onClick={sent ? undefined : handleSendFile}
              >
                {sending
                  ? "Отправляем..."
                  : sent
                    ? "✓ Файл отправлен в чат"
                    : "📄 Получить .conf файлом"}
              </button>
            </>
          ) : (
            <div className={styles.noConfig}>
              После оплаты конфиг появится здесь и в чате с ботом {BRAND_NAME}.
            </div>
          )}
        </div>

        {onOpenSync && (
          <>
            <div className={styles.divider} />
            <button className={styles.syncBtn} onClick={onOpenSync}>
              🔗 Привязать веб-аккаунт
            </button>
          </>
        )}
      </div>
    </div>
  );
}
