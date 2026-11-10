import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "key_secret_123";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_456";
});

describe("razorpay signatures", async () => {
  const { razorpayProvider } = await import("@/lib/payments/razorpay");

  it("verifies checkout signature = HMAC(order_id|payment_id, key_secret)", () => {
    const sig = createHmac("sha256", "key_secret_123").update("order_A|pay_B").digest("hex");
    expect(razorpayProvider.verifyCheckoutSignature("order_A", "pay_B", sig)).toBe(true);
    expect(razorpayProvider.verifyCheckoutSignature("order_A", "pay_C", sig)).toBe(false);
    expect(razorpayProvider.verifyCheckoutSignature("order_A", "pay_B", "deadbeef")).toBe(false);
  });

  it("verifies webhook signature over the raw body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = createHmac("sha256", "whsec_456").update(body).digest("hex");
    expect(razorpayProvider.verifyWebhook(body, sig)).toBe(true);
    expect(razorpayProvider.verifyWebhook(body + " ", sig)).toBe(false);
    expect(razorpayProvider.verifyWebhook(body, "")).toBe(false);
  });
});
