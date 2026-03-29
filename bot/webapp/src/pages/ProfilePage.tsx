import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import { BRAND_NAME } from "../../../shared/texts";
import { PriceList } from "../components/PriceList";
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

type RenewalStatus = "idle" | "loading" | "polling" | "success" | "error";

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

export function ProfilePage() {
  const user = useTelegramUser();
  const { config: localConfig, save: saveLocalConfig } = useVpnConfig();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState<PricingOption>(PRICING[0]);
  const [renewalStatus, setRenewalStatus] = useState<RenewalStatus>("idle");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      const r = await fetch("/api/subscription", {
        headers: { "X-Telegram-Init-Data": WebApp.initData },
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchSubscription().then((data) => {
      if (!alive) return;
      if (data) {
        setSub(data);
        if (data.config) saveLocalConfig(data.config);
      } else {
        setSub({ active: false, expired_at: null, config: null });
      }
      setLoaded(true);
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

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleRenew = useCallback(async () => {
    if (renewalStatus === "loading" || renewalStatus === "polling") return;
    setRenewalStatus("loading");

    try {
      const res = await fetch("/api/payments/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ months: selectedPlan.months }),
      });

      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);

      const { confirmationUrl, paymentId } = await res.json();
      WebApp.openLink(confirmationUrl, { try_instant_view: false });

      setRenewalStatus("polling");
      let attempts = 0;
      const MAX_ATTEMPTS = 90;

      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch(`/api/payments/status/${paymentId}`, {
            headers: { "X-Telegram-Init-Data": WebApp.initData },
          });
          if (!statusRes.ok) return;
          const data = await statusRes.json();

          if (data.status === "succeeded") {
            stopPolling();
            setRenewalStatus("success");
            const updated = await fetchSubscription();
            if (updated) {
              setSub(updated);
              if (updated.config) saveLocalConfig(updated.config);
            }
            setTimeout(() => setRenewalStatus("idle"), 5000);
            return;
          }

          if (data.status === "canceled") {
            stopPolling();
            setRenewalStatus("idle");
            return;
          }
        } catch { /* retry */ }

        if (attempts >= MAX_ATTEMPTS) {
          stopPolling();
          setRenewalStatus("error");
          WebApp.showAlert(
            "Оплата обработана. Подписка обновится в ближайшее время.",
          );
          setTimeout(() => setRenewalStatus("idle"), 4000);
        }
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Неизвестная ошибка";
      WebApp.showAlert(`Ошибка: ${message}`);
      setRenewalStatus("idle");
    }
  }, [renewalStatus, selectedPlan, stopPolling, fetchSubscription, saveLocalConfig]);

  const renewalTitle = sub?.active
    ? "Продление подписки"
    : "Оформить подписку";

  const renewalButtonText =
    renewalStatus === "loading"
      ? "ЗАГРУЗКА..."
      : sub?.active
        ? `ПРОДЛИТЬ ЗА ${selectedPlan.price}₽`
        : `КУПИТЬ ЗА ${selectedPlan.price}₽`;

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

        {loaded && (
          <>
            <div className={styles.divider} />

            <div className={styles.renewalBlock}>
              <div className={styles.sectionHeader}>{renewalTitle}</div>

              {renewalStatus === "polling" ? (
                <div className={styles.pollingContainer}>
                  <div className={styles.spinner} />
                  <p className={styles.pollingText}>Ожидаем оплату...</p>
                  <p className={styles.pollingHint}>
                    Оплатите в открывшемся браузере и вернитесь сюда.
                  </p>
                </div>
              ) : renewalStatus === "success" ? (
                <div className={styles.successMessage}>
                  Подписка успешно продлена!
                </div>
              ) : renewalStatus === "error" ? (
                <div className={styles.errorMessage}>
                  Оплата обработана. Подписка обновится в ближайшее время.
                </div>
              ) : (
                <>
                  {sub?.active && sub.expired_at && (
                    <p className={styles.renewalHint}>
                      Срок будет добавлен к текущей подписке
                      (до {new Date(sub.expired_at).toLocaleDateString("ru-RU")})
                    </p>
                  )}

                  <PriceList
                    options={PRICING}
                    selectedMonths={selectedPlan.months}
                    onSelect={(m) => {
                      const opt = PRICING.find((p) => p.months === m);
                      if (opt) setSelectedPlan(opt);
                    }}
                  />

                  <button
                    className={`${styles.renewBtn} ${renewalStatus === "loading" ? styles.renewBtnDisabled : ""}`}
                    onClick={renewalStatus === "loading" ? undefined : handleRenew}
                  >
                    {renewalButtonText}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
