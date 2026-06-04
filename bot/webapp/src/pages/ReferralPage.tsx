import WebApp from "@twa-dev/sdk";
import { useCallback, useEffect, useState } from "react";
import { BRAND_NAME, MINI_APP_URL, TELEGRAM_BOT_URL } from "../../../shared/texts";
import styles from "./ReferralPage.module.css";

const REFERRAL_INVITER_SUCCESS =
  "Промокод успешно применён, при покупке вам будет в подарок 30 дней";

// ── Tiers ──────────────────────────────────────────────────────────────────
const TIERS = [
  { min: 1, max: 3, days: 30, label: "+30 дн.", color: "#00DFEE" },
  { min: 4, max: 10, days: 45, label: "+45 дн.", color: "#A8FF3E" },
  { min: 11, max: Infinity, days: 60, label: "+60 дн.", color: "#FF375F" },
] as const;

function getRingProgress(converted: number): [number, number, number] {
  const r1 = Math.min(converted, 3) / 3;
  const r2 = Math.max(0, Math.min(converted - 3, 7)) / 7;
  const r3 = Math.max(0, Math.min(converted - 10, 20)) / 20;
  return [r1, r2, r3];
}

// ── ActivityRings SVG component ─────────────────────────────────────────────
function ActivityRings({ converted }: { converted: number }) {
  const [animProg, setAnimProg] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    // Recompute when converted changes
    const p = getRingProgress(converted);
    const raf = requestAnimationFrame(() => {
      setAnimProg(p);
    });
    return () => cancelAnimationFrame(raf);
  }, [converted]);

  const SIZE = 200;
  const C = SIZE / 2; // center = 100
  const STROKE = 13;

  // outer → inner (rendered first so inner sits on top)
  const rings = [
    { r: 78, color: "#FF375F", bg: "rgba(255,55,95,0.15)", prog: animProg[2] },
    { r: 60, color: "#A8FF3E", bg: "rgba(168,255,62,0.15)", prog: animProg[1] },
    { r: 42, color: "#00DFEE", bg: "rgba(0,223,238,0.15)", prog: animProg[0] },
  ];

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={styles.ringssvg}
    >
      {rings.map(({ r, color, bg, prog }) => {
        const circ = 2 * Math.PI * r;
        const offset = circ * (1 - prog);
        return (
          <g key={r} transform={`rotate(-90, ${C}, ${C})`}>
            <circle cx={C} cy={C} r={r} fill="none" stroke={bg} strokeWidth={STROKE} />
            <circle
              cx={C}
              cy={C}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Interfaces ───────────────────────────────────────────────────────────────
interface ReferralStats {
  totalInvited: number;
  totalConverted: number;
  daysEarned: number;
  pending: number;
  currentTier: 1 | 2 | 3;
  invitees: { displayName: string; appliedAt: string; hasConverted: boolean; purchaseCount: number }[];
}

interface SubInfo {
  my_referral_code?: string;
  referred_by_applied?: boolean;
  referred_by_code?: string | null;
  referred_by_nickname?: string | null;
}

function formatReferrerNickname(nickname: string | null | undefined): string | null {
  if (!nickname) return null;
  const trimmed = nickname.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function ReferralPage() {
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
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
      .then((data) => { if (alive) setSub(data ?? {}); })
      .catch(() => { if (alive) setSub({}); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/referral/stats", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive && data) setStats(data as ReferralStats); })
      .catch(() => {});
    return () => { alive = false; };
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

  const handleShareCode = useCallback(() => {
    if (!sub?.my_referral_code) return;
    const shareText = [
      `Пользуюсь ${BRAND_NAME} — рекомендую!`,
      `Реферальный код: ${sub.my_referral_code}`,
      `Подарочный VPN: ${MINI_APP_URL}`,
      `Бот: ${TELEGRAM_BOT_URL}`,
    ].join("\n");
    WebApp.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(MINI_APP_URL)}&text=${encodeURIComponent(shareText)}`,
    );
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
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": WebApp.initData },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Не удалось активировать промокод.");
      setPromoCode("");
      if (data?.kind === "gift") {
        setPromoMessage(
          `Подарочный промокод активирован. Подписка продлена на ${data.months ?? 0} мес.`,
        );
        return;
      }
      if (data?.kind === "referral") {
        setSub((prev) =>
          prev
            ? {
                ...prev,
                my_referral_code: data?.my_referral_code ?? prev.my_referral_code,
                referred_by_applied: Boolean(data?.referred_by_applied),
                referred_by_code: data?.referred_by_code ?? normalizedCode,
                referred_by_nickname: data?.referred_by_nickname ?? prev.referred_by_nickname,
              }
            : prev,
        );
        setPromoMessage(data?.referral_message ?? REFERRAL_INVITER_SUCCESS);
        return;
      }
      throw new Error("Не удалось активировать промокод.");
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : "Не удалось активировать промокод.");
    } finally {
      setPromoLoading(false);
    }
  }, [promoCode, promoLoading]);

  const converted = stats?.totalConverted ?? 0;
  const referrerNickname = formatReferrerNickname(sub?.referred_by_nickname);

  return (
    <div className={styles.page}>
      {/* ── Activity rings + tier labels ── */}
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
            {TIERS.map((t, i) => {
              const isActive =
                i === 0 ? converted >= 1 && converted <= 3 :
                i === 1 ? converted >= 4 && converted <= 10 :
                converted >= 11;
              const isDone =
                i === 0 ? converted > 3 :
                i === 1 ? converted > 10 : false;
              return (
                <div
                  key={i}
                  className={`${styles.tierRow} ${isActive ? styles.tierRowActive : ""} ${isDone ? styles.tierRowDone : ""}`}
                >
                  <span className={styles.tierDot} style={{ background: t.color }} />
                  <div className={styles.tierInfo}>
                    <span className={styles.tierRange}>
                      {i === 2 ? "11+" : `${t.min}–${t.max}`} приглашённых
                    </span>
                    <span className={styles.tierDays} style={{ color: t.color }}>
                      {t.label} за каждого
                    </span>
                  </div>
                  {isDone && <span className={styles.tierCheck}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statNum}>
            {stats != null ? Math.max(0, stats.totalInvited) : "—"}
          </div>
          <div className={styles.statLabel}>Приглашено</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>
            {stats != null ? converted : "—"}
          </div>
          <div className={styles.statLabel}>Купили</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>
            {stats ? (stats.daysEarned > 0 ? `${stats.daysEarned}д` : "0") : "—"}
          </div>
          <div className={styles.statLabel}>Заработано</div>
        </div>
      </div>

      {/* ── Referral code ── */}
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
            className={styles.iconBtn}
            onClick={handleCopyReferralCode}
            disabled={!sub?.my_referral_code}
            title="Копировать"
          >
            {referralCopied ? "✓" : "📋"}
          </button>
          <button
            className={styles.iconBtn}
            onClick={handleShareCode}
            disabled={!sub?.my_referral_code}
            title="Поделиться"
          >
            📤
          </button>
        </div>
        {sub?.referred_by_applied && sub.referred_by_code && (
          <div className={styles.appliedBadge}>
            <div>✓ Реферальный код применён: {sub.referred_by_code}</div>
            {referrerNickname && (
              <div className={styles.appliedInviter}>Пригласил: {referrerNickname}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Promo code ── */}
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
              if (e.key === "Enter") { e.preventDefault(); void handleRedeemPromo(); }
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
        {promoMessage && <div className={styles.promoSuccess}>{promoMessage}</div>}
        {promoError && <div className={styles.promoError}>{promoError}</div>}
      </div>

      {/* ── Invitees list ── */}
      {stats && stats.invitees.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Приглашённые</div>
          <div className={styles.inviteeList}>
            {stats.invitees.map((inv, i) => (
              <div key={i} className={styles.inviteeRow}>
                <span className={styles.inviteeIcon}>
                  {inv.hasConverted ? (inv.purchaseCount > 1 ? "🔥" : "✅") : "🕐"}
                </span>
                <span className={styles.inviteeName}>{inv.displayName}</span>
                <span className={styles.inviteeStatus}>
                  {inv.hasConverted
                    ? inv.purchaseCount > 1
                      ? `${inv.purchaseCount} покупки`
                      : "Купил"
                    : "Ожидает"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
