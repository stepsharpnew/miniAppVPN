import WebApp from "@twa-dev/sdk";
import { useCallback, useEffect, useState } from "react";
import styles from "./ReferralPage.module.css";

const REFERRAL_INVITER_SUCCESS =
  "Промокод успешно применён, при покупке вам будет в подарок 1 месяц";

interface SubInfo {
  active?: boolean;
  my_referral_code?: string;
  referred_by_applied?: boolean;
  referred_by_code?: string | null;
  referral_message?: string | null;
}

export function ReferralPage() {
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/subscription", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setSub(data ?? {});
      })
      .catch(() => {
        if (alive) setSub({});
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleCopyReferralCode = useCallback(async () => {
    if (!sub?.my_referral_code) return;
    try {
      await navigator.clipboard.writeText(sub.my_referral_code);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      WebApp.showAlert("Не удалось скопировать код.");
    }
  }, [sub?.my_referral_code]);

  const handleRedeemPromo = useCallback(async () => {
    const normalizedCode = promoCode.trim().toUpperCase();
    if (!normalizedCode || promoLoading) return;

    setPromoLoading(true);
    setPromoError(null);
    setPromoMessage(null);

    try {
      const res = await fetch("/api/promocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ code: normalizedCode }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Не удалось активировать промокод.");
      }

      setPromoCode("");

      if (data?.kind === "gift") {
        setPromoMessage(
          `Подарочный промокод активирован. Подписка продлена на ${data.months ?? 0} мес.`,
        );
        return;
      }

      throw new Error("Не удалось активировать промокод.");
    } catch (err) {
      if (!sub?.referred_by_applied) {
        try {
          const res = await fetch("/api/referral-code", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Telegram-Init-Data": WebApp.initData,
            },
            body: JSON.stringify({ code: normalizedCode }),
          });

          const data = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error(data?.error ?? "Промокод не найден");
          }

          setPromoCode("");
          setSub((prev) =>
            prev
              ? {
                  ...prev,
                  my_referral_code: data?.my_referral_code ?? prev.my_referral_code,
                  referred_by_applied: Boolean(data?.referred_by_applied),
                  referred_by_code: data?.referred_by_code ?? normalizedCode,
                  referral_message: data?.referral_message ?? prev.referral_message,
                }
              : prev,
          );
          setPromoMessage(data?.referral_message ?? REFERRAL_INVITER_SUCCESS);
          return;
        } catch (referralErr) {
          const message =
            referralErr instanceof Error ? referralErr.message : "Промокод не найден";
          setPromoError(message);
          return;
        }
      }

      const message =
        err instanceof Error ? err.message : "Не удалось активировать промокод.";
      setPromoError(message);
    } finally {
      setPromoLoading(false);
    }
  }, [promoCode, promoLoading, sub?.referred_by_applied]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.sectionTitle}>Ваш реферальный код</div>
        <p className={styles.hint}>
          Поделитесь кодом с другом — он получит бонус при покупке, а вы
          получите вознаграждение.
        </p>

        <div className={styles.codeRow}>
          <div className={styles.codeValue}>
            {sub === null ? "Загрузка..." : (sub.my_referral_code ?? "—")}
          </div>
          <button
            className={styles.copyBtn}
            onClick={handleCopyReferralCode}
            disabled={!sub?.my_referral_code}
          >
            {referralCopied ? "✓ Скопировано" : "Копировать"}
          </button>
        </div>

        {sub?.referred_by_applied && sub.referred_by_code ? (
          <div className={styles.appliedBadge}>
            ✓ Реферальный код применён: {sub.referred_by_code}
          </div>
        ) : null}
      </div>

      <div className={styles.card}>
        <div className={styles.sectionTitle}>Применить промокод</div>
        <p className={styles.hint}>
          Введите подарочный или реферальный промокод.
        </p>

        <div className={styles.promoRow}>
          <input
            className={styles.promoInput}
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Подарочный или реферальный"
            maxLength={32}
            disabled={promoLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleRedeemPromo();
              }
            }}
          />
          <button
            className={styles.promoBtn}
            onClick={handleRedeemPromo}
            disabled={promoLoading || promoCode.trim().length === 0}
          >
            {promoLoading ? "..." : "Применить"}
          </button>
        </div>

        {promoMessage ? (
          <div className={styles.promoSuccess}>{promoMessage}</div>
        ) : null}
        {promoError ? (
          <div className={styles.promoError}>{promoError}</div>
        ) : null}
      </div>
    </div>
  );
}
