import {
  applyReferralCode,
  redeemPromoCode,
  type ApplyReferralCodeError,
  type PromoRedeemError,
} from "./db";

export type UnifiedRedeemError =
  | PromoRedeemError
  | ApplyReferralCodeError
  | "not_found";

export type UnifiedRedeemResult =
  | {
      ok: true;
      kind: "gift";
      months: number;
      oldExpiredAt: string | null;
      newExpiredAt: string;
    }
  | {
      ok: true;
      kind: "referral";
      referral_message: string;
      referred_by_code: string;
    }
  | { ok: false; error: UnifiedRedeemError };

/** Подарочный промокод, при отсутствии — реферальный код (как /redeem в боте). */
export async function redeemUnifiedCode(
  userId: string,
  rawCode: string,
): Promise<UnifiedRedeemResult> {
  const promo = await redeemPromoCode(userId, rawCode);
  if (promo.ok && promo.months != null && promo.newExpiredAt != null) {
    return {
      ok: true,
      kind: "gift",
      months: promo.months,
      oldExpiredAt: promo.oldExpiredAt ?? null,
      newExpiredAt: promo.newExpiredAt,
    };
  }

  if (promo.error && promo.error !== "not_found") {
    return { ok: false, error: promo.error };
  }

  const referral = await applyReferralCode(userId, rawCode);
  if (referral.ok) {
    return {
      ok: true,
      kind: "referral",
      referral_message: referral.referral_message ?? "",
      referred_by_code: referral.referred_by_code ?? rawCode.trim().toUpperCase(),
    };
  }

  return { ok: false, error: referral.error ?? "not_found" };
}
