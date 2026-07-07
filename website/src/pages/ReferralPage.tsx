import { useCallback, useEffect, useState } from "react";
import { type WebUser } from "../hooks/useAuth";
import { apiFetch } from "../utils/api";
import { BRAND_NAME, TELEGRAM_BOT_URL } from "../data/plans";
import styles from "./ReferralPage.module.css";

const REFERRAL_INVITER_SUCCESS =
  "Промокод успешно применён, при покупке вам будет в подарок 30 дней";

const TIERS = [
  { min: 1, max: 3, label: "+30 дн.", color: "#00DFEE" },
  { min: 4, max: 10, label: "+45 дн.", color: "#A8FF3E" },
  { min: 11, max: Infinity, label: "+60 дн.", color: "#FF375F" },
] as const;

interface ReferralStats {
  totalInvited: number;
  totalConverted: number;
  daysEarned: number;
  pending: number;
  currentTier: 1 | 2 | 3;
  invitees: {
    displayName: string;
    appliedAt: string;
    hasConverted: boolean;
    purchaseCount: number;
  }[];
}

interface SubInfo {
  active?: boolean;
  expired_at?: string | null;
  is_blocked?: boolean;
  config?: string | null;
  happ_subscription_url?: string | null;
  my_referral_code?: string | null;
  referred_by_applied?: boolean;
  referred_by_code?: string | null;
  referred_by_nickname?: string | null;
  referral_message?: string | null;
}

interface ReferralPageProps {
  user: WebUser | null;
}

function getRingProgress(converted: number): [number, number, number] {
  const r1 = Math.min(converted, 3) / 3;
  const r2 = Math.max(0, Math.min(converted - 3, 7)) / 7;
  const r3 = Math.max(0, Math.min(converted - 10, 20)) / 20;
  return [r1, r2, r3];
}

function ActivityRings({ converted }: { converted: number }) {
  const [animProg, setAnimProg] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimProg(getRingProgress(converted)));
    return () => cancelAnimationFrame(raf);
  }, [converted]);

  const size = 200;
  const center = size / 2;
  const stroke = 13;
  const rings = [
    { r: 78, color: "#FF375F", bg: "rgba(255,55,95,0.15)", prog: animProg[2] },
    { r: 60, color: "#A8FF3E", bg: "rgba(168,255,62,0.15)", prog: animProg[1] },
    { r: 42, color: "#00DFEE", bg: "rgba(0,223,238,0.15)", prog: animProg[0] },
  ];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.ringssvg}>
      {rings.map(({ r, color, bg, prog }) => {
        const circ = 2 * Math.PI * r;
        return (
          <g key={r} transform={`rotate(-90, ${center}, ${center})`}>
            <circle cx={center} cy={center} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - prog)}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function formatReferrerName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : trimmed;
}

function shareUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/#purchase`;
}

export function ReferralPage({ user }: ReferralPageProps) {
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!user) return;
    Promise.all([
      apiFetch<SubInfo>("/api/web/subscription"),
      apiFetch<ReferralStats>("/api/web/referral/stats"),
    ])
      .then(([subscription, referralStats]) => {
        if (!alive) return;
        setSub(subscription);
        setStats(referralStats);
      })
      .catch(() => {
        if (!alive) return;
        setSub({});
        setStats(null);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const markCopied = useCallback(() => {
    setReferralCopied(true);
    window.setTimeout(() => setReferralCopied(false), 2000);
  }, []);

  const handleCopyReferralCode = useCallback(async () => {
    if (!sub?.my_referral_code) return;
    try {
      await navigator.clipboard.writeText(sub.my_referral_code);
      markCopied();
    } catch {
      /* clipboard may be unavailable on older browsers */
    }
  }, [markCopied, sub?.my_referral_code]);

  const handleShareCode = useCallback(async () => {
    if (!sub?.my_referral_code) return;
    const url = shareUrl();
    const text = [
      `Пользуюсь ${BRAND_NAME} — рекомендую!`,
      `Реферальный код: ${sub.my_referral_code}`,
      `Сайт: ${url}`,
      `Бот: ${TELEGRAM_BOT_URL}`,
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: BRAND_NAME, text, url });
        return;
      }
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        markCopied();
      } catch {
        /* ignore */
      }
    }
  }, [markCopied, sub?.my_referral_code]);

  const handleRedeemPromo = useCallback(async () => {
    const normalizedCode = promoCode.trim().toUpperCase();
    if (!normalizedCode || promoLoading) return;
    setPromoLoading(true);
    setPromoError(null);
    setPromoMessage(null);

    try {
      const data = await apiFetch<{
        kind?: "gift" | "referral";
        months?: number;
        subscription?: SubInfo;
        my_referral_code?: string | null;
        referral_message?: string | null;
        referred_by_applied?: boolean;
        referred_by_code?: string | null;
        referred_by_nickname?: string | null;
      }>("/api/web/promocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });

      setPromoCode("");

      if (data.kind === "gift" && data.subscription) {
        setSub(data.subscription);
        setPromoMessage(
          `Подарочный промокод активирован. Подписка продлена на ${data.months ?? 0} мес.`,
        );
        return;
      }

      if (data.kind === "referral") {
        setSub((prev) => ({
          ...(prev ?? {}),
          my_referral_code: data.my_referral_code ?? prev?.my_referral_code,
          referred_by_applied: Boolean(data.referred_by_applied),
          referred_by_code: data.referred_by_code ?? normalizedCode,
          referred_by_nickname: data.referred_by_nickname ?? prev?.referred_by_nickname,
          referral_message: data.referral_message ?? prev?.referral_message,
        }));
        setPromoMessage(data.referral_message ?? REFERRAL_INVITER_SUCCESS);
        return;
      }

      throw new Error("Не удалось активировать промокод.");
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : "Не удалось активировать промокод.");
    } finally {
      setPromoLoading(false);
    }
  }, [promoCode, promoLoading]);

  if (!user) return null;

  const converted = stats?.totalConverted ?? 0;
  const referrerName = formatReferrerName(sub?.referred_by_nickname);

  return (
    <div className={styles.page}>
      <div className={styles.ringsCard}>
        <div className={styles.ringsRow}>
          <div className={styles.ringsWrap}>
            <ActivityRings converted={converted} />
            <div className={styles.ringsCenter}>
              <div className={styles.ringsCenterCount}>{converted}</div>
              <div className={styles.ringsCenterLabel}>конверсий</div>
            </div>
          </div>
          <div className={styles.tierList}>
            {TIERS.map((tier, idx) => {
              const isActive =
                idx === 0 ? converted >= 1 && converted <= 3 :
                idx === 1 ? converted >= 4 && converted <= 10 :
                converted >= 11;
              const isDone = idx === 0 ? converted > 3 : idx === 1 ? converted > 10 : false;
              return (
                <div
                  key={tier.label}
                  className={`${styles.tierRow} ${isActive ? styles.tierRowActive : ""} ${isDone ? styles.tierRowDone : ""}`}
                >
                  <span className={styles.tierDot} style={{ background: tier.color }} />
                  <div className={styles.tierInfo}>
                    <span className={styles.tierRange}>
                      {idx === 2 ? "11+" : `${tier.min}-${tier.max}`} приглашённых
                    </span>
                    <span className={styles.tierDays} style={{ color: tier.color }}>
                      {tier.label} за каждого
                    </span>
                  </div>
                  {isDone ? <span className={styles.tierCheck}>✓</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{stats ? Math.max(0, stats.totalInvited) : "—"}</div>
          <div className={styles.statLabel}>Приглашено</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{stats ? converted : "—"}</div>
          <div className={styles.statLabel}>Купили</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{stats ? (stats.daysEarned > 0 ? `${stats.daysEarned}д` : "0") : "—"}</div>
          <div className={styles.statLabel}>Заработано</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.sectionTitle}>Ваш реферальный код</div>
        <p className={styles.hint}>
          Поделитесь кодом — друг получит бонус при покупке, вы получите дни.
        </p>
        <div className={styles.codeRow}>
          <div className={styles.codeValue}>
            {sub === null ? "Загрузка..." : (sub.my_referral_code ?? "—")}
          </div>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleCopyReferralCode}
            disabled={!sub?.my_referral_code}
            title="Копировать"
          >
            {referralCopied ? "✓" : "📋"}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleShareCode}
            disabled={!sub?.my_referral_code}
            title="Поделиться"
          >
            📤
          </button>
        </div>
        {sub?.referred_by_applied && sub.referred_by_code ? (
          <div className={styles.appliedBadge}>
            <div>✓ Реферальный код применён: {sub.referred_by_code}</div>
            {referrerName ? (
              <div className={styles.appliedInviter}>Пригласил: {referrerName}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.card}>
        <div className={styles.sectionTitle}>Применить промокод</div>
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
            type="button"
            className={styles.promoBtn}
            onClick={() => void handleRedeemPromo()}
            disabled={promoLoading || promoCode.trim().length === 0}
          >
            {promoLoading ? "..." : "Применить"}
          </button>
        </div>
        {promoMessage ? <div className={styles.promoSuccess}>{promoMessage}</div> : null}
        {promoError ? <div className={styles.promoError}>{promoError}</div> : null}
      </div>

      {stats && stats.invitees.length > 0 ? (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Приглашённые</div>
          <div className={styles.inviteeList}>
            {stats.invitees.map((invitee, idx) => (
              <div key={`${invitee.displayName}-${idx}`} className={styles.inviteeRow}>
                <span className={styles.inviteeIcon}>
                  {invitee.hasConverted ? (invitee.purchaseCount > 1 ? "🔥" : "✅") : "🕐"}
                </span>
                <span className={styles.inviteeName}>{invitee.displayName}</span>
                <span className={styles.inviteeStatus}>
                  {invitee.hasConverted
                    ? invitee.purchaseCount > 1
                      ? `${invitee.purchaseCount} покупки`
                      : "Купил"
                    : "Ожидает"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
