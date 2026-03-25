import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import { Header } from "../components/Header";
import { PriceList } from "../components/PriceList";
import { QrModal } from "../components/QrModal";
import { useMainButton } from "../hooks/useMainButton";
import { useVpnConfig } from "../hooks/useVpnConfig";

try { localStorage.removeItem("vpn_config"); } catch { /* ok */ }

type PaymentStatus = "idle" | "loading" | "provisioning" | "error";

interface PurchasePageProps {
  active: boolean;
}

export function PurchasePage({ active }: PurchasePageProps) {
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const { save: saveConfig } = useVpnConfig();

  const showConfig = useCallback(
    async (config: string) => {
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

  const provisionConfig = useCallback(
    async (durationCode: string) => {
      setStatus("provisioning");
      try {
        const res = await fetch("/api/payments/provision", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": WebApp.initData,
          },
          body: JSON.stringify({ durationCode }),
        });

        if (!res.ok) {
          throw new Error(`Ошибка получения конфига: ${res.status}`);
        }

        const { config } = await res.json();
        await showConfig(config);
        setStatus("idle");
      } catch (err) {
        console.error("provision error:", err);
        WebApp.showAlert(
          "Оплата прошла, но не удалось получить конфиг. Попробуйте открыть приложение позже — конфиг появится в профиле.",
        );
        setStatus("error");
      }
    },
    [showConfig],
  );

  const handleClick = useCallback(async () => {
    if (status === "loading" || status === "provisioning") return;

    setStatus("loading");

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
        if (invoiceStatus === "paid" || invoiceStatus === "pending") {
          provisionConfig(selected.durationCode);
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
  }, [status, selected, provisionConfig]);

  const buttonText =
    status === "loading" || status === "provisioning"
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

        {status === "provisioning" && (
          <p style={pollingText}>Получаем ваш конфиг...</p>
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

const pollingText: React.CSSProperties = {
  color: "#AAAACC",
  fontSize: 14,
  textAlign: "center",
  marginTop: 16,
};

const errorText: React.CSSProperties = {
  color: "#AAAACC",
  fontSize: 14,
  textAlign: "center",
  marginTop: 16,
};
