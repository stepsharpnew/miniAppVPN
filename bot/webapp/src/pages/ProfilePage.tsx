import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { BRAND_NAME } from "../../../shared/texts";
import { StatusBadge } from "../components/StatusBadge";
import { useTelegramUser } from "../hooks/useTelegramUser";
import { useVpnConfig } from "../hooks/useVpnConfig";
import { waitForTelegramInitData } from "../utils/telegramInitData";
import styles from "./ProfilePage.module.css";

interface SubscriptionInfo {
  active: boolean;
  expired_at: string | null;
  is_blocked?: boolean;
  is_vip?: boolean;
  config?: string | null;
  happ_subscription_url?: string | null;
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
  active?: boolean;
  onOpenSync?: () => void;
  onOpenInstructions?: () => void;
}

function buildHappDeepLink(subscriptionUrl: string): string {
  return `happ://add/${subscriptionUrl}`;
}

export function ProfilePage({ active = true, onOpenSync, onOpenInstructions }: ProfilePageProps) {
  const user = useTelegramUser();
  const { config: localConfig, save: saveLocalConfig } = useVpnConfig();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [happCopied, setHappCopied] = useState(false);
  const [syncChecked, setSyncChecked] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncedLogin, setSyncedLogin] = useState<string | null>(null);
  const [clientKind, setClientKind] = useState<"happ" | "amneziawg">("amneziawg");
  const [reissuing, setReissuing] = useState(false);
  const [reissueOk, setReissueOk] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    (async () => {
      const initData = await waitForTelegramInitData();
      const data = initData
        ? await fetch("/api/subscription", {
            headers: { "X-Telegram-Init-Data": initData },
          }).then((r) => (r.ok ? r.json() : null))
        : null;

        if (!alive) return;
        if (data) {
          setSub(data);
          if (data.config) saveLocalConfig(data.config);
        } else {
          setSub({ active: false, expired_at: null, config: null });
        }
        setLoaded(true);
    })().catch(() => {
        if (alive) {
          setSub({ active: false, expired_at: null, config: null });
          setLoaded(true);
        }
      });
    return () => { alive = false; };
  }, [active, saveLocalConfig]);

  useEffect(() => {
    const onSubscriptionUpdated = (event: Event) => {
      const next = (event as CustomEvent<SubscriptionInfo>).detail;
      if (!next) return;
      setSub(next);
      setLoaded(true);
      if (next.config) saveLocalConfig(next.config);
    };
    window.addEventListener("memevpn:subscription-updated", onSubscriptionUpdated);
    return () => {
      window.removeEventListener("memevpn:subscription-updated", onSubscriptionUpdated);
    };
  }, [saveLocalConfig]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const initData = await waitForTelegramInitData();
      const data = initData
        ? await fetch("/api/sync/status", {
            headers: { "X-Telegram-Init-Data": initData },
          }).then((r) => (r.ok ? r.json() : null))
        : null;

        if (!alive) return;
        setIsSynced(Boolean(data?.synced));
        setSyncedLogin(data?.login ?? null);
        setSyncChecked(true);
    })().catch(() => {
        if (!alive) return;
        setSyncChecked(true);
      });
    return () => { alive = false; };
  }, []);

  const activeConfig = sub?.config ?? (sub?.active ? localConfig : null);
  const happUrl = sub?.happ_subscription_url ?? null;

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

  const handleReissue = useCallback(() => {
    if (reissuing) return;
    WebApp.showConfirm(
      "Получить конфиг с другого сервера?\n\nТекущий конфиг перестанет работать.",
      (confirmed) => {
        if (!confirmed) return;
        setReissuing(true);
        setReissueOk(false);
        fetch("/api/vpn/reissue", {
          method: "POST",
          headers: { "X-Telegram-Init-Data": WebApp.initData },
        })
          .then(async (r) => {
            const data = await r.json().catch(() => null);
            if (!r.ok) throw new Error(data?.error ?? "Ошибка");
            setSub((prev) => prev ? { ...prev, config: data.config } : prev);
            setSent(false);
            setReissueOk(true);
            window.setTimeout(() => setReissueOk(false), 4000);
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : "Не удалось сменить сервер";
            WebApp.showAlert(msg);
          })
          .finally(() => setReissuing(false));
      },
    );
  }, [reissuing]);

  const handleOpenHapp = useCallback(() => {
    if (!happUrl) return;
    void navigator.clipboard.writeText(happUrl).then(() => {
      setHappCopied(true);
      window.setTimeout(() => setHappCopied(false), 2000);
    }).catch(() => {});
  }, [happUrl]);

  return (
    <div className={styles.page}>
      {onOpenInstructions ? (
        <button
          type="button"
          className={styles.helpLink}
          onClick={onOpenInstructions}
        >
          <span className={styles.helpLinkIcon} aria-hidden>
            📖
          </span>
          <span className={styles.helpLinkText}>Инструкция по подключению</span>
        </button>
      ) : null}
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
            {syncChecked && (
              <div className={styles.syncBadgeRow}>
                {isSynced ? (
                  <>
                    <span className={styles.syncBadgeOk}>✓ Синхронизирован</span>
                    {syncedLogin && (
                      <span className={styles.syncBadgeLogin}>{syncedLogin}</span>
                    )}
                  </>
                ) : onOpenSync ? (
                  <button className={styles.syncBadgeLink} onClick={onOpenSync}>
                    🔗 Привязать аккаунт
                  </button>
                ) : null}
              </div>
            )}
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
                  <button
                    className={styles.secondaryBtn}
                    onClick={handleCopyHappUrl}
                  >
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
              <div className={styles.reissueBlock}>
                <div className={styles.reissueHint}>
                  Этот сервер не работает?
                </div>
                <button
                  type="button"
                  className={`${styles.reissueBtn} ${reissueOk ? styles.reissueBtnOk : ""}`}
                  onClick={handleReissue}
                  disabled={reissuing}
                >
                  {reissuing
                    ? "Переключаем..."
                    : reissueOk
                      ? "✓ Сервер сменён"
                      : "🔄 Сменить сервер"}
                </button>
              </div>
            </>
          ) : (
            <div className={styles.noConfig}>
              После оплаты конфиг появится здесь и в чате с ботом {BRAND_NAME}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
