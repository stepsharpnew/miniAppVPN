import WebApp from "@twa-dev/sdk";
import { useCallback, useState } from "react";
import { PRICING, type PricingOption } from "../../../shared/plans";
import { Header } from "../components/Header";
import { PriceList } from "../components/PriceList";
import { useMainButton } from "../hooks/useMainButton";

type PaymentStatus = "idle" | "loading" | "paid" | "error";

interface PurchasePageProps {
  active: boolean;
}

export function PurchasePage({ active }: PurchasePageProps) {
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);
  const [status, setStatus] = useState<PaymentStatus>("idle");

  const handleClick = useCallback(async () => {
    if (status === "loading") return;

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
        if (invoiceStatus === "paid") {
          setStatus("paid");
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
  }, [status, selected]);

  const buttonText =
    status === "loading"
      ? "ЗАГРУЗКА..."
      : status === "paid"
        ? "✅ ОПЛАЧЕНО"
        : `КУПИТЬ ЗА ${selected.price}₽`;

  useMainButton({
    text: buttonText,
    onClick: handleClick,
    visible: active && status !== "paid",
  });

  return (
    <>
      <Header />

      <section style={{ padding: "0 16px 24px" }}>
        {status === "paid" ? (
          <div style={successBlock}>
            <div style={{ fontSize: 48 }}>🎉</div>
            <h3 style={{ margin: "12px 0 8px", color: "#FFFFFF" }}>
              Оплата прошла успешно!
            </h3>
            <p style={{ color: "#AAAACC", lineHeight: 1.5 }}>
              Ваш VPN-конфиг отправлен в чат с ботом.
              <br />
              Откройте чат, чтобы скопировать конфиг.
            </p>
          </div>
        ) : (
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

        {status === "error" && (
          <p style={errorText}>
            Что-то пошло не так. Попробуйте ещё раз или обратитесь в
            поддержку.
          </p>
        )}
      </section>
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

const successBlock: React.CSSProperties = {
  textAlign: "center",
  padding: "40px 16px",
};

const errorText: React.CSSProperties = {
  color: "#FF6B6B",
  fontSize: 14,
  textAlign: "center",
  marginTop: 16,
};
