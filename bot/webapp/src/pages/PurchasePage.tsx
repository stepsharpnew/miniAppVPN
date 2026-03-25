import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useRef, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import { Header } from "../components/Header";
import { PriceList } from "../components/PriceList";
import { QrModal } from "../components/QrModal";
import { useMainButton } from "../hooks/useMainButton";
import { useVpnConfig } from "../hooks/useVpnConfig";

// Wipe leftover cache from the old (pre-payment) version
try { localStorage.removeItem("vpn_config"); } catch { /* ok */ }

type PaymentStatus = "idle" | "loading" | "polling" | "error";

const POLL_INTERVAL = 1500;
const POLL_MAX_ATTEMPTS = 20;

async function pollConfig(): Promise<string> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const res = await fetch("/api/payments/config", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    });
    if (res.ok) {
      const { config } = await res.json();
      return config as string;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error("Конфиг не готов. Попробуйте позже.");
}

interface PurchasePageProps {
  active: boolean;
}

export function PurchasePage({ active }: PurchasePageProps) {
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const abortRef = useRef(false);
  const { save: saveConfig } = useVpnConfig();

  const showConfig = useCallback(async (config: string) => {
    saveConfig(config);
    setConfigText(config);
    const dataUrl = await QRCode.toDataURL(config, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    setQrDataUrl(dataUrl);
  }, [saveConfig]);

  const handleClick = useCallback(async () => {
    if (status === "loading" || status === "polling") return;

    setStatus("loading");
    abortRef.current = false;

    try {
      WebApp.MainButton.showProgress(false);

      const res = await fetch("/api/payments/create-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ months: selected.months }),
      });

      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);

      const { invoiceLink } = await res.json();

      WebApp.MainButton.hideProgress();

      WebApp.openInvoice(invoiceLink, (invoiceStatus: string) => {
        if (invoiceStatus === "paid") {
          setStatus("polling");
          WebApp.MainButton.showProgress(false);

          pollConfig()
            .then((config) => {
              if (!abortRef.current) {
                showConfig(config);
                setStatus("idle");
              }
            })
            .catch((err) => {
              if (!abortRef.current) {
                WebApp.showAlert(
                  err instanceof Error ? err.message : "Ошибка получения конфига",
                );
                setStatus("error");
              }
            })
            .finally(() => {
              WebApp.MainButton.hideProgress();
            });
        } else if (invoiceStatus === "cancelled") {
          setStatus("idle");
        } else {
          setStatus("error");
        }
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Неизвестная ошибка";
      WebApp.showAlert(`Ошибка: ${message}`);
      setStatus("idle");
    } finally {
      WebApp.MainButton.hideProgress();
    }
  }, [status, selected, showConfig]);

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
        <h3 style={sectionTitle}>Тариф</h3>
        <PriceList
          options={PRICING}
          selectedMonths={selected.months}
          onSelect={(m) => {
            const opt = PRICING.find((p) => p.months === m);
            if (opt) setSelected(opt);
          }}
        />

        {status === "polling" && (
          <p style={pollingText}>Получаем ваш конфиг...</p>
        )}

        {status === "error" && (
          <p style={errorText}>
            Что-то пошло не так. Попробуйте ещё раз или обратитесь в
            поддержку.
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

const pollingText: React.CSSProperties = {
  color: "#AAAACC",
  fontSize: 14,
  textAlign: "center",
  marginTop: 16,
};

const errorText: React.CSSProperties = {
  color: "#FF6B6B",
  fontSize: 14,
  textAlign: "center",
  marginTop: 16,
};
