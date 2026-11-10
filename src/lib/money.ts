export interface FeeConfig {
  feeBps: number;
  feeMinPaise: number;
  feeMaxPaise: number;
}

/** Platform commission charged to the seller. Never exceeds half the price. */
export function computeFee(pricePaise: number, c: FeeConfig): number {
  if (!Number.isInteger(pricePaise) || pricePaise <= 0) throw new Error("price must be a positive integer (paise)");
  let fee = Math.round((pricePaise * c.feeBps) / 10_000);
  fee = Math.max(fee, c.feeMinPaise);
  fee = Math.min(fee, c.feeMaxPaise);
  fee = Math.min(fee, Math.floor(pricePaise / 2));
  return fee;
}

export function computeNoShowCompensation(pricePaise: number, bps: number, maxPaise: number): number {
  return Math.min(Math.round((pricePaise * bps) / 10_000), maxPaise);
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

/** Parse a rupee amount typed by a user ("1,499.50") into paise. */
export function rupeesToPaise(input: string | number): number | null {
  const s = String(input).replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}
