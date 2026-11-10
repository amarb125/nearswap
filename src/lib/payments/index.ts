import { config } from "../config";
import { mockProvider } from "./mock";
import { razorpayProvider } from "./razorpay";
import type { PaymentProvider } from "./types";

export function payments(): PaymentProvider {
  return config().PAYMENT_PROVIDER === "razorpay" ? razorpayProvider : mockProvider;
}
export type { PaymentProvider } from "./types";
