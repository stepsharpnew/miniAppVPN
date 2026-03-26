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

type PaymentStatus =
  | "idle"
  | "loading"
  | "widget"
  | "polling"
  | "error";

interface PurchasePageProps {
  active: boolean;
}

export function PurchasePage({ active }: PurchasePageProps) {
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const { save: saveConfig } = useVpnConfig();
  const checkoutRef = useRef<YooMoneyCheckoutWidget | null>(null);
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
      const MAX_ATTEMPTS = 45;

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

  // On mount: check if there's a pending payment from before a page reload
  useEffect(() => {
    let savedId: string | null = null;
    try { savedId = sessionStorage.getItem(PENDING_KEY); } catch { /* ok */ }
    if (savedId) {
      pollForConfig(savedId);
    }
    return () => {
      checkoutRef.current?.destroy();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const destroyWidget = useCallback(() => {
    checkoutRef.current?.destroy();
    checkoutRef.current = null;
  }, []);

  const handleClick = useCallback(async () => {
    if (status === "loading" || status === "widget" || status === "polling") return;

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

      const { confirmationToken, paymentId } = await res.json();

      try { sessionStorage.setItem(PENDING_KEY, paymentId); } catch { /* ok */ }

      WebApp.MainButton.hideProgress();

      if (!window.YooMoneyCheckoutWidget) {
        throw new Error("Виджет ЮКасса не загружен");
      }

      setStatus("widget");

      const checkout = new window.YooMoneyCheckoutWidget({
        confirmation_token: confirmationToken,
        customization: {
          colors: {
            control_primary: "#7C3AED",
            background: "#121225",
          },
        },
        error_callback(error) {
          console.error("YooKassa widget error:", error);
          const msg = String(error ?? "");
          destroyWidget();
          if (/ERR_UNKNOWN_URL_SCHEME|unknown.*scheme/i.test(msg)) {
            WebApp.showAlert(
              "СБП не поддерживается в Telegram. Пожалуйста, оплатите картой, через SberPay или T-Pay.",
            );
            try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ok */ }
            setStatus("idle");
          } else {
            pollForConfig(paymentId);
          }
        },
      });

      checkoutRef.current = checkout;

      checkout.on("success", () => {
        destroyWidget();
        pollForConfig(paymentId);
      });

      checkout.on("fail", () => {
        destroyWidget();
        try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ok */ }
        setStatus("idle");
        WebApp.showAlert("Платёж не прошёл. Попробуйте ещё раз.");
      });

      await checkout.render("yookassa-payment-form");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Неизвестная ошибка";
      WebApp.showAlert(`Ошибка: ${message}`);
      setStatus("idle");
    } finally {
      WebApp.MainButton.hideProgress();
    }
  }, [status, selected, pollForConfig, destroyWidget]);

  const buttonText =
    status === "loading" || status === "polling"
      ? "ЗАГРУЗКА..."
      : status === "widget"
        ? "ОПЛАТА..."
        : `КУПИТЬ ЗА ${selected.price}₽`;

  const hideButton = status === "widget";

  useMainButton({
    text: buttonText,
    onClick: handleClick,
    visible: active && !hideButton,
  });

  return (
    <>
      <Header />

      <section style={{ padding: "0 16px 24px" }}>
        {status !== "widget" && status !== "polling" && (
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

        <div
          id="yookassa-payment-form"
          style={{
            display: status === "widget" ? "block" : "none",
            minHeight: status === "widget" ? 400 : 0,
          }}
        />

        {status === "polling" && (
          <div style={pollingContainer}>
            <div style={spinnerStyle} />
            <p style={pollingText}>Оплата прошла! Получаем ваш VPN-конфиг...</p>
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
  gap: 16,
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

const pollingText: React.CSSProperties = {
  color: "#AAAACC",
  fontSize: 14,
  textAlign: "center",
};

const errorText: React.CSSProperties = {
  color: "#AAAACC",
  fontSize: 14,
  textAlign: "center",
  marginTop: 16,
};
