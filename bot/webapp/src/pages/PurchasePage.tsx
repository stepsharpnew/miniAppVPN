import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import { PLATFORMS, type PlatformInfo } from "../../../shared/platforms";
import { Header } from "../components/Header";
import { PlatformSelect } from "../components/PlatformSelect";
import { PriceList } from "../components/PriceList";
import { QrModal } from "../components/QrModal";
import { useVpnConfig } from "../hooks/useVpnConfig";
import styles from "./PurchasePage.module.css";

try { localStorage.removeItem("vpn_config"); } catch { /* ok */ }

const PENDING_KEY = "pending_payment_id";
const PLATFORM_KEY = "selected_platform";

type PaymentStatus = "idle" | "loading" | "polling" | "error";

interface PurchasePageProps {
  active: boolean;
}

function getSavedPlatform(): PlatformInfo {
  try {
    const id = localStorage.getItem(PLATFORM_KEY);
    const found = PLATFORMS.find((p) => p.id === id);
    if (found) return found;
  } catch { /* ok */ }
  return PLATFORMS[0];
}

export function PurchasePage({ active }: PurchasePageProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformInfo>(getSavedPlatform);
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const { save: saveConfig } = useVpnConfig();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasActiveSub, setHasActiveSub] = useState(false);

  useEffect(() => {
    fetch("/api/subscription", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.active) setHasActiveSub(true);
      })
      .catch(() => {});
  }, []);

  const handlePlatformSelect = useCallback((platform: PlatformInfo) => {
    setSelectedPlatform(platform);
    try { localStorage.setItem(PLATFORM_KEY, platform.id); } catch { /* ok */ }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const showConfig = useCallback(
    async (config: string) => {
      try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ok */ }
      saveConfig(config);
      const dataUrl = await QRCode.toDataURL(config, {
        width: 260,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrDataUrl(dataUrl);
    },
    [saveConfig],
  );

  const pollForConfig = useCallback(
    (paymentId: string) => {
      setStatus("polling");
      let attempts = 0;
      const MAX_ATTEMPTS = 90;

      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`/api/payments/status/${paymentId}`, {
            headers: { "X-Telegram-Init-Data": WebApp.initData },
          });
          if (!res.ok) return;
          const data = await res.json();

          if (data.status === "succeeded" && data.config) {
            stopPolling();
            await showConfig(data.config);
            setStatus("idle");
            return;
          }

          if (data.status === "canceled") {
            stopPolling();
            try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ok */ }
            setStatus("idle");
            return;
          }
        } catch { /* retry */ }

        if (attempts >= MAX_ATTEMPTS) {
          stopPolling();
          try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ok */ }
          WebApp.showAlert(
            "Оплата прошла, но конфиг ещё не готов. Он появится в профиле или в чате с ботом.",
          );
          setStatus("error");
        }
      }, 2000);
    },
    [showConfig, stopPolling],
  );

  useEffect(() => {
    let savedId: string | null = null;
    try { savedId = sessionStorage.getItem(PENDING_KEY); } catch { /* ok */ }
    if (savedId) {
      pollForConfig(savedId);
    }
    return () => { stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(async () => {
    if (status === "loading" || status === "polling") return;

    setStatus("loading");

    try {
      const res = await fetch("/api/payments/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ months: selected.months }),
      });

      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);

      const { confirmationUrl, paymentId } = await res.json();

      try { sessionStorage.setItem(PENDING_KEY, paymentId); } catch { /* ok */ }

      WebApp.openLink(confirmationUrl, { try_instant_view: false });

      pollForConfig(paymentId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Неизвестная ошибка";
      WebApp.showAlert(`Ошибка: ${message}`);
      setStatus("idle");
    }
  }, [status, selected, pollForConfig]);

  const isDisabled = status === "loading" || status === "polling";
  const buttonText =
    status === "loading"
      ? "ЗАГРУЗКА..."
      : hasActiveSub
        ? `ПРОДЛИТЬ ЗА ${selected.price}₽`
        : `КУПИТЬ ЗА ${selected.price}₽`;

  return (
    <>
      <Header />

      <section className={styles.section}>
        {status !== "polling" && (
          <>
            <h3 className={styles.sectionTitle}>Ваше устройство</h3>
            <PlatformSelect
              platforms={PLATFORMS}
              selectedId={selectedPlatform.id}
              onSelect={handlePlatformSelect}
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
          </>
        )}

        {status === "polling" && (
          <div className={styles.pollingContainer}>
            <div className={styles.spinner} />
            <p className={styles.pollingTitle}>Ожидаем оплату...</p>
            <p className={styles.pollingHint}>
              Оплатите в открывшемся браузере и вернитесь сюда.
              Конфиг появится автоматически.
            </p>
          </div>
        )}

        {status === "error" && (
          <p className={styles.errorText}>
            Оплата прошла. Конфиг появится в профиле или в чате с ботом.
          </p>
        )}
      </section>

      {active && status !== "polling" && (
        <div className={styles.buyButtonWrap}>
          <button
            className={`${styles.buyButton} ${isDisabled ? styles.disabled : ""}`}
            onClick={isDisabled ? undefined : handleClick}
          >
            {buttonText}
          </button>
        </div>
      )}

      {qrDataUrl && (
        <QrModal
          qrDataUrl={qrDataUrl}
          platform={selectedPlatform}
          onClose={() => setQrDataUrl(null)}
        />
      )}
    </>
  );
}
