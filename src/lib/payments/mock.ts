import { hmac, safeEqualHex } from "../crypto";
import type { PaymentProvider } from "./types";

/**
 * Development-only provider. The "checkout" is a confirm button in the UI that calls
 * /api/payments/mock/pay, which signs the payment like a real gateway would.
 * Refuses to be constructed in production (see config()).
 */
export function mockSignature(providerOrderId: string, paymentId: string) {
  return hmac(`${providerOrderId}|${paymentId}`, "mock-pay");
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  async createOrder({ orderId, amountPaise }) {
    const providerOrderId = `mock_order_${orderId}`;
    return { provider: "mock", providerOrderId, amountPaise };
  },
  verifyCheckoutSignature(providerOrderId, paymentId, signature) {
    return /^[0-9a-f]{64}$/.test(signature) && safeEqualHex(mockSignature(providerOrderId, paymentId), signature);
  },
  async fetchPayment(paymentId) {
    // mock payment ids encode the order: mock_pay_<providerOrderId>_<amount>
    const m = /^mock_pay_(mock_order_[A-Za-z0-9]+)_(\d+)$/.exec(paymentId);
    if (!m) throw new Error("unknown mock payment");
    return { id: paymentId, orderId: m[1], amountPaise: Number(m[2]), status: "captured" };
  },
  async capture() {},
  async transfer(paymentId) {
    return `mock_trf_${paymentId.slice(-12)}_${Date.now()}`;
  },
  async refund(paymentId) {
    return `mock_rfnd_${paymentId.slice(-12)}_${Date.now()}`;
  },
  async createLinkedAccount({ userId }) {
    return { accountId: `mock_acc_${userId}`, active: true };
  },
  verifyWebhook() {
    return false; // mock has no webhooks
  },
};
