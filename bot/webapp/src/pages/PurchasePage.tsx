import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import { Header } from "../components/Header";
import { PriceList } from "../components/PriceList";
import { QrModal } from "../components/QrModal";
import { useMainButton } from "../hooks/useMainButton";
import { useTelegramUser } from "../hooks/useTelegramUser";

const STORAGE_KEY = "vpn_config";

function loadCachedConfig(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveCachedConfig(config: string) {
  try {
    localStorage.setItem(STORAGE_KEY, config);
  } catch {
    /* quota exceeded or unavailable */
  }
}

interface PurchasePageProps {
  active: boolean;
}

export function PurchasePage({ active }: PurchasePageProps) {
  const user = useTelegramUser();
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    const cached = loadCachedConfig();
    if (cached) {
      setConfigText(cached);
      setHasConfig(true);
    }
  }, []);

  const showQr = useCallback(async (config: string) => {
    const dataUrl = await QRCode.toDataURL(config, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    setQrDataUrl(dataUrl);
  }, []);

  const handleClick = useCallback(async () => {
    if (loading) return;

    if (hasConfig && configText) {
      await showQr(configText);
      return;
    }

    setLoading(true);
    try {
      WebApp.MainButton.showProgress(false);

      const clientName =
        user.username !== "username" ? user.username : `tg_${user.id}`;

      const res = await fetch("/api/vpn-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientName,
          duration: selected.durationCode,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ошибка сервера: ${res.status}`);
      }

      const json = await res.json();
      const config: string = json.config;

      setConfigText(config);
      setHasConfig(true);
      saveCachedConfig(config);
      await showQr(config);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Неизвестная ошибка";
      WebApp.showAlert(`Ошибка: ${message}`);
    } finally {
      WebApp.MainButton.hideProgress();
      setLoading(false);
    }
  }, [loading, hasConfig, configText, selected, user, showQr]);

  const buttonText = loading
    ? "ЗАГРУЗКА..."
    : hasConfig
      ? "ПОКАЗАТЬ QR-КОД"
      : `КУПИТЬ ЗА ${selected.price}₽`;

  useMainButton({ text: buttonText, onClick: handleClick, visible: active });

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
