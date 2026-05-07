// Pure membership utilities, safe in both server and client bundles.
// The DB-bound resolver (getMemberDiscount, looks up Prisma membership
// row + lazily expires) lives in server/membership.ts so the
// 'server-only' import doesn't poison this file.

export type MemberDiscount = {
  membershipId: string;
  planSlug: string;
  planName: string;
  discountBps: number;
};

// Apply a basis-point discount to a price in minor units (pesewas).
// Round half-up to the nearest minor unit so the discounted total is
// always an integer Prisma can persist. Floor was tempting but rounds
// FAVOUR the buyer in the half-cent case; the difference across an
// order is at most 1 pesewa, well below user-perceivable.
export function applyDiscountBps(priceMinor: number, discountBps: number): number {
  if (discountBps <= 0) return priceMinor;
  if (discountBps >= 10000) return 0;
  const cut = Math.round((priceMinor * discountBps) / 10000);
  return Math.max(0, priceMinor - cut);
}

// Inverse helper for human-facing copy: 2000 -> "20%", 1250 -> "12.5%".
export function formatDiscountBps(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}
