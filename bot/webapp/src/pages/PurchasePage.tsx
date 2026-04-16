import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import {
  PURCHASE_PLATFORMS,
  type PlatformInfo,
} from "../../../shared/platforms";
import { Header } from "../components/Header";
import { PlatformSelect } from "../components/PlatformSelect";
import { PriceList } from "../components/PriceList";
import { QrModal } from "../components/QrModal";
import { useVpnConfig } from "../hooks/useVpnConfig";
import styles from "./PurchasePage.module.css";

try {
  localStorage.removeItem("vpn_config");
} catch {
  /* ok */
}

const PENDING_KEY = "pending_payment_id";
const PLATFORM_KEY = "selected_platform";

type PaymentStatus = "idle" | "loading" | "polling" | "error";

interface PurchasePageProps {
  active: boolean;
}

function getSavedPlatform(): PlatformInfo {
  try {
    const id = localStorage.getItem(PLATFORM_KEY);
    const found = PURCHASE_PLATFORMS.find((p) => p.id === id);
    if (found) return found;
  } catch {
    /* ok */
  }
  return PURCHASE_PLATFORMS[0];
}

export function PurchasePage({ active }: PurchasePageProps) {
  const [selectedPlatform, setSelectedPlatform] =
    useState<PlatformInfo>(getSavedPlatform);
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const { save: saveConfig } = useVpnConfig();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [subExpiredAt, setSubExpiredAt] = useState<string | null>(null);

  const refreshSubscription = useCallback(() => {
    fetch("/api/subscription", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.active) setHasActiveSub(true);
        else setHasActiveSub(false);
        setSubExpiredAt(
          data?.active && data.expired_at ? data.expired_at : null,
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  const handlePlatformSelect = useCallback((platform: PlatformInfo) => {
    setSelectedPlatform(platform);
    try {
      localStorage.setItem(PLATFORM_KEY, platform.id);
    } catch {
      /* ok */
    }
  }, []);

  const pendingIdRef = useRef<string | null>(null);
  const pollAliveRef = useRef(false);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    pollAliveRef.current = false;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const showConfig = useCallback(
    async (config: string) => {
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* ok */
      }
      pendingIdRef.current = null;
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

  const cancelPaymentWait = useCallback(() => {
    stopPolling();
    pendingIdRef.current = null;
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ok */
    }
    setStatus("idle");
  }, [stopPolling]);

  const checkPaymentOnce = useCallback(
    async (paymentId: string): Promise<"continue" | "done"> => {
      try {
        const res = await fetch(`/api/payments/status/${paymentId}`, {
          headers: { "X-Telegram-Init-Data": WebApp.initData },
        });

        if (res.status === 404) return "done";
        if (!res.ok) return "continue";

        const data = await res.json();

        if (data.status === "succeeded") {
          stopPolling();
          if (data.config) {
            await showConfig(data.config);
          }
          refreshSubscription();
          try {
            sessionStorage.removeItem(PENDING_KEY);
          } catch {
            /* ok */
          }
          pendingIdRef.current = null;
          setStatus("idle");
          return "done";
        }

        if (data.status === "canceled") {
          cancelPaymentWait();
          return "done";
        }
      } catch {
        /* retry */
      }
      return "continue";
    },
    [showConfig, stopPolling, refreshSubscription, cancelPaymentWait],
  );

  const startPollingLoop = useCallback(
    (paymentId: string) => {
      if (pollAliveRef.current) return;
      pollAliveRef.current = true;
      setStatus("polling");

      const tick = async () => {
        if (!pollAliveRef.current) return;
        attemptsRef.current++;

        const result = await checkPaymentOnce(paymentId);
        if (result === "done" || !pollAliveRef.current) return;

        if (attemptsRef.current >= 120) {
          stopPolling();
          pendingIdRef.current = null;
          try {
            sessionStorage.removeItem(PENDING_KEY);
          } catch {
            /* ok */
          }
          setStatus("error");
          return;
        }

        pollingRef.current = setTimeout(tick, 2000);
      };

      pollingRef.current = setTimeout(tick, 1500);
    },
    [checkPaymentOnce, stopPolling],
  );

  // On iOS, when user returns from Safari the WebView unfreezes.
  // Immediately check payment status once and restart polling loop.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const pid = pendingIdRef.current;
      if (!pid) return;

      const result = await checkPaymentOnce(pid);
      if (result === "done") return;

      if (!pollAliveRef.current) {
        startPollingLoop(pid);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkPaymentOnce, startPollingLoop]);

  // Restore pending payment from sessionStorage on mount
  useEffect(() => {
    let savedId: string | null = null;
    try {
      savedId = sessionStorage.getItem(PENDING_KEY);
    } catch {
      /* ok */
    }
    if (savedId) {
      pendingIdRef.current = savedId;
      attemptsRef.current = 0;
      startPollingLoop(savedId);
    }
    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(async () => {
    if (status === "loading" || status === "polling") return;

    setStatus("loading");

    // iOS Safari / WKWebView block window.open after async calls.
    // Pre-open a blank window synchronously to preserve user gesture context.
    let payWindow: Window | null = null;
    try {
      payWindow = window.open("about:blank", "_blank");
    } catch {
      /* blocked */
    }

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

      pendingIdRef.current = paymentId;
      attemptsRef.current = 0;
      try {
        sessionStorage.setItem(PENDING_KEY, paymentId);
      } catch {
        /* ok */
      }

      if (payWindow && !payWindow.closed) {
        payWindow.location.href = confirmationUrl;
      } else {
        try {
          WebApp.openLink(confirmationUrl, { try_instant_view: false });
        } catch {
          window.location.href = confirmationUrl;
        }
      }

      startPollingLoop(paymentId);
    } catch (err) {
      if (payWindow && !payWindow.closed) payWindow.close();
      const message = err instanceof Error ? err.message : "Неизвестная ошибка";
      WebApp.showAlert(`Ошибка: ${message}`);
      setStatus("idle");
    }
  }, [status, selected, startPollingLoop]);

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
              platforms={PURCHASE_PLATFORMS}
              selectedId={selectedPlatform.id}
              onSelect={handlePlatformSelect}
            />

            <h3 className={styles.sectionTitleSpaced}>Тариф</h3>
            {hasActiveSub && subExpiredAt && (
              <p className={styles.renewalHint}>
                Срок будет добавлен к текущей подписке (до{" "}
                {new Date(subExpiredAt).toLocaleDateString("ru-RU")})
              </p>
            )}
            <PriceList
              options={PRICING}
              selectedMonths={selected.months}
              onSelect={(m) => {
                const opt = PRICING.find((p) => p.months === m);
                if (opt) setSelected(opt);
              }}
            />

            {active && (
              <div className={styles.buyButtonWrap}>
                <button
                  className={`${styles.buyButton} ${isDisabled ? styles.disabled : ""}`}
                  onClick={isDisabled ? undefined : handleClick}
                >
                  {buttonText}
                </button>
              </div>
            )}
          </>
        )}

        {status === "polling" && (
          <div className={styles.pollingContainer}>
            <div className={styles.spinner} />
            <p className={styles.pollingTitle}>Ожидание оплаты...</p>
            <p className={styles.pollingHint}>
              Оплатите в открывшемся окне и вернитесь сюда. Конфиг появится
              автоматически.
            </p>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={cancelPaymentWait}
            >
              Отменить ожидание
            </button>
          </div>
        )}

        {status === "error" && (
          <p className={styles.errorText}>
            Оплата прошла. Конфиг появится в профиле или в чате с ботом.
          </p>
        )}
      </section>

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
