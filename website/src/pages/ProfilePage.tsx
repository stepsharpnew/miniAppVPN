import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { type WebUser } from "../hooks/useAuth";
import { apiFetch, getAccessToken } from "../utils/api";
import { BRAND_NAME } from "../data/plans";
import { StatusBadge } from "../components/StatusBadge";
import styles from "./ProfilePage.module.css";

interface ProfilePageProps {
  user: WebUser | null;
  onLogout: () => void;
  onNavigate: (tab: "pricing") => void;
}

interface SubData {
  active: boolean;
  expired_at: string | null;
  config: string | null;
  email: string | null;
  referred_by_applied: boolean;
  referred_by_code: string | null;
  referral_message: string | null;
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

export function ProfilePage({ user, onLogout, onNavigate }: ProfilePageProps) {
  const [sub, setSub] = useState<SubData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch<SubData>("/api/web/subscription")
      .then((data) => {
        setSub(data);
        setPromoMessage(data.referral_message ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user]);

  useEffect(() => {
    if (!sub?.config) {
      setQrDataUrl(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(sub.config, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((url) => { if (alive) setQrDataUrl(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sub?.config]);

  const handleCopyConfig = useCallback(() => {
    if (sub?.config) {
      navigator.clipboard.writeText(sub.config).then(() => {
        setConfigCopied(true);
        setTimeout(() => setConfigCopied(false), 2000);
      }).catch(() => {});
    }
  }, [sub?.config]);

  const handleDownloadConf = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    const API_BASE = import.meta.env.VITE_API_URL || "";
    const url = `${API_BASE}/api/web/config/download`;
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Не удалось скачать");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "meme-vpn.conf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  }, []);

  const handleApplyPromo = useCallback(async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code || promoLoading) return;

    setPromoLoading(true);
    setPromoError(null);
    setPromoMessage(null);

    try {
      const data = await apiFetch<{
        kind?: "gift" | "referral";
        months?: number;
        subscription?: SubData;
        referral_message?: string | null;
        referred_by_applied?: boolean;
        referred_by_code?: string | null;
      }>("/api/web/promocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      setPromoCode("");

      if (data.kind === "gift" && data.subscription) {
        setSub(data.subscription);
        setPromoMessage(
          `Подарочный промокод активирован. Подписка +${data.months ?? 0} мес.`,
        );
        return;
      }

      setPromoMessage(
        data.referral_message ??
          "Промокод успешно применен, при покупке вам будет в подарок 1 месяц",
      );
      setSub((prev) =>
        prev
          ? {
              ...prev,
              referred_by_applied: Boolean(data.referred_by_applied),
              referred_by_code: data.referred_by_code ?? code,
              referral_message: data.referral_message ?? prev.referral_message,
            }
          : prev,
      );
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Не удалось активировать промокод";
      setPromoError(message);
    } finally {
      setPromoLoading(false);
    }
  }, [promoCode, promoLoading]);

  if (!user) return null;
  const isTelegramLinked =
    user.auth_source === "both" || user.auth_source === "telegram";

  return (
    <div className={styles.page}>
      <div className={styles.profileCard}>
        <div className={styles.profileTop}>
          <div className={styles.avatarPlaceholder}>
            {(user.email ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className={styles.profileMeta}>
            <div className={styles.userName}>{user.email}</div>
            <div className={styles.userId}>ID: {user.id.slice(0, 8)}...</div>
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

        <div className={styles.telegramSyncBlock}>
          <div className={styles.sectionHeader}>Синхронизация Telegram</div>
          <div
            className={`${styles.syncStatus} ${isTelegramLinked ? styles.syncLinked : styles.syncNotLinked}`}
          >
            {isTelegramLinked
              ? "Аккаунт привязан к Telegram"
              : "Аккаунт не привязан к Telegram"}
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.promoBlock}>
          <div className={styles.sectionHeader}>Промокод</div>
          <div className={styles.referralHint}>
            Подарочный промокод продлевает подписку сразу. Реферальный код — бонусный месяц после
            оплаты.
          </div>
          <div className={styles.promoRow}>
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              className={styles.promoInput}
              placeholder="Введите промокод"
              disabled={promoLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleApplyPromo();
                }
              }}
            />
            <button
              type="button"
              className={styles.promoBtn}
              disabled={!promoCode.trim() || promoLoading}
              onClick={() => void handleApplyPromo()}
            >
              {promoLoading ? "Проверяем..." : "Применить"}
            </button>
          </div>
          {sub?.referred_by_applied && sub.referred_by_code ? (
            <div className={styles.referralHint}>
              Применен код: <b>{sub.referred_by_code}</b>
            </div>
          ) : null}
          {promoMessage ? <div className={styles.promoSuccess}>{promoMessage}</div> : null}
          {promoError ? <div className={styles.promoError}>{promoError}</div> : null}
        </div>

        <div className={styles.divider} />

        <div className={styles.configBlock}>
          <div className={styles.sectionHeader}>VPN конфиг</div>

          {!loaded ? (
            <div className={styles.noConfig}>Загрузка...</div>
          ) : sub?.active && sub.config && qrDataUrl ? (
            <>
              <img
                src={qrDataUrl}
                alt="QR код конфигурации"
                className={styles.qr}
              />
              <div className={styles.configActions}>
                <button className={styles.copyBtn} onClick={handleCopyConfig}>
                  {configCopied ? "✅ Скопировано!" : "📋 Скопировать конфиг"}
                </button>
                <button className={styles.downloadBtn} onClick={handleDownloadConf}>
                  📥 Скачать .conf
                </button>
              </div>
            </>
          ) : (
            <div className={styles.noConfig}>
              {sub?.active
                ? "Конфиг генерируется..."
                : `Купите подписку — конфиг появится здесь. ${BRAND_NAME}`}
            </div>
          )}
        </div>
      </div>

      {!sub?.active && (
        <button className={styles.buyBtn} onClick={() => onNavigate("pricing")}>
          Купить подписку
        </button>
      )}

      <button className={styles.logoutBtn} onClick={onLogout}>
        Выйти из аккаунта
      </button>
    </div>
  );
}
