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
  my_referral_code?: string;
  referred_by_applied?: boolean;
  referred_by_code?: string | null;
  referral_message?: string | null;
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
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [showSyncInfo, setShowSyncInfo] = useState(false);
  const [syncChecked, setSyncChecked] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncedEmail, setSyncedEmail] = useState<string | null>(null);

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
          setReferralMessage(data.referral_message ?? null);
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

  useEffect(() => {
    let alive = true;
    fetch("/api/sync/status", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setIsSynced(Boolean(data?.synced));
        setSyncedEmail(data?.email ?? null);
        setSyncChecked(true);
      })
      .catch(() => {
        if (!alive) return;
        setSyncChecked(true);
      });

    return () => {
      alive = false;
    };
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

  const handleRedeemPromo = useCallback(async () => {
    const normalizedCode = promoCode.trim().toUpperCase();
    if (!normalizedCode || promoLoading || sub?.referred_by_applied) return;

    setPromoLoading(true);
    setReferralError(null);
    setReferralMessage(null);
    try {
      const res = await fetch("/api/promocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ code: normalizedCode }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Не удалось активировать промокод.");
      }

      setSub((prev) => (
        prev
          ? {
              ...prev,
              my_referral_code: data?.my_referral_code ?? prev.my_referral_code,
              referred_by_applied: Boolean(data?.referred_by_applied),
              referred_by_code: data?.referred_by_code ?? normalizedCode,
              referral_message: data?.referral_message ?? prev.referral_message,
            }
          : prev
      ));
      setPromoCode("");
      setReferralMessage(
        data?.referral_message ??
          "Промокод успешно применен, при покупке вам будет в подарок 1 месяц",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось активировать промокод.";
      setReferralError(message);
    } finally {
      setPromoLoading(false);
    }
  }, [promoCode, promoLoading, sub?.referred_by_applied]);

  const handleCopyReferralCode = useCallback(async () => {
    if (!sub?.my_referral_code) return;
    try {
      await navigator.clipboard.writeText(sub.my_referral_code);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      WebApp.showAlert("Не удалось скопировать код.");
    }
  }, [sub?.my_referral_code]);

  const referralApplied = Boolean(sub?.referred_by_applied);

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

        <div className={styles.syncStatusCard}>
          <div className={styles.syncStatusTitle}>Синхронизация аккаунта</div>
          {!syncChecked ? (
            <div className={styles.syncStatusText}>Проверяем статус...</div>
          ) : isSynced ? (
            <>
              <div className={styles.syncStatusOk}>✓ Аккаунт синхронизирован</div>
              {syncedEmail && (
                <div className={styles.syncStatusText}>
                  Вход в веб-кабинет: <b>{syncedEmail}</b>
                </div>
              )}
            </>
          ) : (
            <div className={styles.syncStatusText}>
              Аккаунт пока не синхронизирован с веб-версией.
            </div>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.promoBlock}>
          <div className={styles.sectionHeader}>Ваш реферальный код</div>
          <div className={styles.referralCodeCard}>
            <div className={styles.referralCodeValue}>
              {sub?.my_referral_code ?? "Загрузка..."}
            </div>
            <button
              className={styles.secondaryBtn}
              onClick={handleCopyReferralCode}
              disabled={!sub?.my_referral_code}
            >
              {referralCopied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.promoBlock}>
          <div className={styles.sectionHeader}>Ввести чужой рефкод</div>
          <div className={styles.referralHint}>
            После покупки вы получите в подарок 1 месяц.
          </div>
          <div className={styles.promoRow}>
            <input
              className={styles.promoInput}
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Введите рефкод"
              maxLength={32}
              readOnly={referralApplied}
              disabled={promoLoading || referralApplied}
            />
            <button
              className={styles.promoBtn}
              onClick={handleRedeemPromo}
              disabled={promoLoading || promoCode.trim().length === 0 || referralApplied}
            >
              {promoLoading ? "..." : referralApplied ? "Применен" : "Применить"}
            </button>
          </div>
          {referralApplied && sub?.referred_by_code ? (
            <div className={styles.referralHint}>
              Применен код: <b>{sub.referred_by_code}</b>
            </div>
          ) : null}
          {referralMessage ? (
            <div className={styles.promoSuccess}>{referralMessage}</div>
          ) : null}
          {referralError ? (
            <div className={styles.promoError}>{referralError}</div>
          ) : null}
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
            <div className={styles.syncActionRow}>
              <button className={styles.syncBtn} onClick={onOpenSync}>
                🔗 Привязать веб-аккаунт
              </button>
              <div className={styles.syncInfoWrap}>
                <button
                  className={styles.syncInfoBtn}
                  onClick={() => setShowSyncInfo((prev) => !prev)}
                  aria-label="Зачем нужна привязка аккаунта"
                >
                  i
                </button>
                {showSyncInfo && (
                  <div className={styles.syncTooltip}>
                    Привязка нужна, чтобы при потере доступа к Telegram вы не
                    потеряли доступ к своим серверам. Также это позволит войти
                    в веб-аккаунт и оплатить подписку, если VPN-конфиг
                    отключили.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
