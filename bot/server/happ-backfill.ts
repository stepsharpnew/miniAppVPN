const INITIAL_BACKFILL_RETRY_MS = 5 * 60 * 1000;
const MAX_BACKFILL_RETRY_MS = 60 * 60 * 1000;

const lazyBackfillFailures = new Map<string, { attempts: number; nextRetryAt: number }>();
const lazyBackfillInFlight = new Set<string>();

export type LazyHappBackfillClaim = "claimed" | "cooldown" | "in_progress";

export function claimLazyHappBackfill(key: string): LazyHappBackfillClaim {
  if (lazyBackfillInFlight.has(key)) return "in_progress";

  const failure = lazyBackfillFailures.get(key);
  if (failure && Date.now() < failure.nextRetryAt) return "cooldown";

  lazyBackfillInFlight.add(key);
  return "claimed";
}

export function releaseLazyHappBackfill(key: string): void {
  lazyBackfillInFlight.delete(key);
}

export function recordLazyHappBackfillSuccess(key: string): void {
  releaseLazyHappBackfill(key);
  lazyBackfillFailures.delete(key);
}

export function recordLazyHappBackfillFailure(key: string, label: string, err: unknown): void {
  releaseLazyHappBackfill(key);
  const previous = lazyBackfillFailures.get(key);
  const attempts = (previous?.attempts ?? 0) + 1;
  const delayMs = Math.min(
    MAX_BACKFILL_RETRY_MS,
    INITIAL_BACKFILL_RETRY_MS * 2 ** (attempts - 1),
  );
  lazyBackfillFailures.set(key, {
    attempts,
    nextRetryAt: Date.now() + delayMs,
  });

  const message = err instanceof Error ? err.message : String(err);
  const retryMinutes = Math.ceil(delayMs / 60_000);
  console.error(`${label}: ${message}; retry in ~${retryMinutes}m`);
}
