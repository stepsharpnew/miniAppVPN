import { useState } from "react";
import { PRICING, type PricingOption } from "../data/plans";
import { PURCHASE_PLATFORMS, type PlatformInfo } from "../data/platforms";
import { type WebUser } from "../hooks/useAuth";
import { apiFetch } from "../utils/api";
import { PlatformSelect } from "../components/PlatformSelect";
import { PriceList } from "../components/PriceList";
import styles from "./PricingPage.module.css";

interface PricingPageProps {
  user: WebUser | null;
}

export function PricingPage({ user }: PricingPageProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformInfo>(
    PURCHASE_PLATFORMS[0],
  );
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  const handleBuy = async () => {
    if (!user) return;
    setError("");
    setLoading(true);
    try {
      const { confirmationUrl, paymentId: pid } = await apiFetch<{
        confirmationUrl: string;
        paymentId: string;
      }>("/api/web/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: selected.months }),
      });
      setPaymentId(pid);
      window.open(confirmationUrl, "_blank");
      startPolling(pid);
    } catch (err: any) {
      setError(err.message || "Ошибка создания платежа");
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (pid: string) => {
    setPolling(true);
    setPaymentStatus("pending");
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const data = await apiFetch<{ status: string; config: string | null }>(
          `/api/web/payments/status/${pid}`,
        );
        setPaymentStatus(data.status);
        if (data.status === "succeeded") {
          clearInterval(interval);
          setPolling(false);
        } else if (data.status === "canceled") {
          clearInterval(interval);
          setPolling(false);
        }
      } catch {
        // keep trying
      }
      if (attempts > 120) {
        clearInterval(interval);
        setPolling(false);
      }
    }, 3000);
  };

  const buttonText = `КУПИТЬ ЗА ${selected.price}₽`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>🛒</div>
        <div>
          <div className={styles.headerTitle}>Тарифы</div>
          <div className={styles.headerSubtitle}>
            Выберите устройство и срок подписки
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Ваше устройство</h3>
        <PlatformSelect
          platforms={PURCHASE_PLATFORMS}
          selectedId={selectedPlatform.id}
          onSelect={setSelectedPlatform}
        />

        <h3 className={styles.sectionTitleSpaced}>Тариф</h3>
        <PriceList
          options={PRICING}
          selectedMonths={selected.months}
          onSelect={(m) => {
            const opt = PRICING.find((p) => p.months === m);
            if (opt) setSelected(opt);
          }}
        />

        <div className={styles.buyButtonWrap}>
          {paymentStatus === "succeeded" ? (
            <div className={styles.successBlock}>
              <div className={styles.successIcon}>✅</div>
              <div className={styles.successText}>
                Оплата прошла успешно!
                <br />
                <span className={styles.successHint}>
                  Перейдите в Профиль чтобы получить конфиг
                </span>
              </div>
            </div>
          ) : paymentStatus === "canceled" ? (
            <div className={styles.cancelBlock}>
              <div className={styles.cancelText}>Платёж отменён</div>
              <button className={styles.buyButton} onClick={handleBuy} disabled={loading || !user}>
                Попробовать снова
              </button>
            </div>
          ) : polling ? (
            <div className={styles.pollingBlock}>
              <div className={styles.spinner} />
              <div className={styles.pollingText}>
                Ожидание оплаты...
                <br />
                <span className={styles.pollingHint}>
                  Оплатите в открывшемся окне
                </span>
              </div>
            </div>
          ) : (
            <>
              <button
                className={styles.buyButton}
                onClick={handleBuy}
                disabled={loading || !user}
              >
                {loading ? "Создание платежа..." : buttonText}
              </button>
              {error && <div className={styles.errorText}>{error}</div>}
              {!user && (
                <p className={styles.buyHint}>
                  Войдите в аккаунт для покупки
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
