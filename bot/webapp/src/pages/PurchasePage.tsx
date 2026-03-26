import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import { Header } from "../components/Header";
import { PriceList } from "../components/PriceList";
import { QrModal } from "../components/QrModal";
import { useMainButton } from "../hooks/useMainButton";
import { useVpnConfig } from "../hooks/useVpnConfig";

try { localStorage.removeItem("vpn_config"); } catch { /* ok */ }

const PENDING_KEY = "pending_payment_id";

type PaymentStatus = "idle" | "loading" | "polling" | "error";

interface PurchasePageProps {
  active: boolean;
}

export function PurchasePage({ active }: PurchasePageProps) {
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const { save: saveConfig } = useVpnConfig();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setConfigText(config);
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

  // On mount: resume polling if a payment was in progress (user returned from browser)
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
      WebApp.MainButton.showProgress(false);

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

      WebApp.MainButton.hideProgress();

      // Open YooKassa payment page in system browser (deep links work there)
      WebApp.openLink(confirmationUrl, { try_instant_view: false });

      // Start polling — user will return to Mini App after payment
      pollForConfig(paymentId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Неизвестная ошибка";
      WebApp.showAlert(`Ошибка: ${message}`);
      setStatus("idle");
    } finally {
      WebApp.MainButton.hideProgress();
    }
  }, [status, selected, pollForConfig]);

  const buttonText =
    status === "loading" || status === "polling"
      ? "ЗАГРУЗКА..."
      : `КУПИТЬ ЗА ${selected.price}₽`;

  useMainButton({
    text: buttonText,
    onClick: handleClick,
    visible: active,
  });

  return (
    <>
      <Header />

      <section style={{ padding: "0 16px 24px" }}>
        {status !== "polling" && (
          <>
            <h3 style={sectionTitle}>Тариф</h3>
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
          <div style={pollingContainer}>
            <div style={spinnerStyle} />
            <p style={pollingTitle}>Ожидаем оплату...</p>
            <p style={pollingHint}>
              Оплатите в открывшемся браузере и вернитесь сюда.
              Конфиг появится автоматически.
            </p>
          </div>
        )}

        {status === "error" && (
          <p style={errorText}>
            Оплата прошла. Конфиг появится в профиле или в чате с ботом.
          </p>
        )}
      </section>

      {qrDataUrl && (
        <QrModal
          qrDataUrl={qrDataUrl}
          configText={configText}
          onClose={() => setQrDataUrl(null)}
        />
      )}
    </>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#7777AA",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 12,
};

const pollingContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  padding: "48px 16px",
};

const spinnerStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  border: "3px solid rgba(124, 58, 237, 0.2)",
  borderTopColor: "#7C3AED",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};

const pollingTitle: React.CSSProperties = {
  color: "#FFFFFF",
  fontSize: 16,
  fontWeight: 600,
  textAlign: "center",
};

const pollingHint: React.CSSProperties = {
  color: "#AAAACC",
  fontSize: 13,
  textAlign: "center",
  lineHeight: "1.5",
};

const errorText: React.CSSProperties = {
  color: "#AAAACC",
  fontSize: 14,
  textAlign: "center",
  marginTop: 16,
};
