/** In-memory store for pending YooKassa payments (paymentId → order info). */

export interface PendingPayment {
  paymentId: string;
  userId: number;
  username: string;
  firstName: string;
  months: number;
  durationCode: string;
  amount: number;
  status: "pending" | "succeeded" | "canceled";
  config?: string;
  createdAt: number;
}

const payments = new Map<string, PendingPayment>();

const TTL_MS = 60 * 60 * 1000; // 1 hour

function evictExpired(): void {
  const now = Date.now();
  for (const [id, entry] of payments) {
    if (now - entry.createdAt > TTL_MS) payments.delete(id);
  }
}

export function savePendingPayment(p: Omit<PendingPayment, "createdAt">): void {
  evictExpired();
  payments.set(p.paymentId, { ...p, createdAt: Date.now() });
}

export function getPendingPayment(paymentId: string): PendingPayment | null {
  const entry = payments.get(paymentId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    payments.delete(paymentId);
    return null;
  }
  return entry;
}

export function markPaymentSucceeded(paymentId: string, config?: string): boolean {
  const entry = payments.get(paymentId);
  if (!entry) return false;
  entry.status = "succeeded";
  if (config) entry.config = config;
  return true;
}

export function markPaymentCanceled(paymentId: string): void {
  const entry = payments.get(paymentId);
  if (entry) entry.status = "canceled";
}
