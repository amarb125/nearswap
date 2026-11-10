import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import type { PaymentProvider, PaymentInfo } from "./types";

/**
 * Razorpay Route: buyer pays into the platform's Razorpay account (funds are held by the
 * regulated payment aggregator, not by us). On successful handover we create a Transfer
 * from that payment to the seller's Linked Account; on rejection we refund the payment.
 * Docs: https://razorpay.com/docs/payments/route/
 */
const BASE = "https://api.razorpay.com";

async function call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const c = config();
  const headers: Record<string, string> = {
    Authorization: "Basic " + Buffer.from(`${c.RAZORPAY_KEY_ID}:${c.RAZORPAY_KEY_SECRET}`).toString("base64"),
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["X-Razorpay-Idempotency-Key"] = idempotencyKey;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = json?.error?.description ?? text;
    throw new Error(`Razorpay ${method} ${path} failed (${res.status}): ${msg}`);
  }
  return json as T;
}

function hmacHex(secret: string, data: string) {
  return createHmac("sha256", secret).update(data).digest("hex");
}
function eqHex(a: string, b: string) {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrder({ orderId, amountPaise, description }) {
    const o = await call<{ id: string }>("POST", "/v1/orders", {
      amount: amountPaise,
      currency: "INR",
      receipt: orderId,
      notes: { orderId, description: description.slice(0, 200) },
    });
    return { provider: "razorpay", providerOrderId: o.id, amountPaise, keyId: config().RAZORPAY_KEY_ID };
  },

  verifyCheckoutSignature(providerOrderId, paymentId, signature) {
    const expected = hmacHex(config().RAZORPAY_KEY_SECRET!, `${providerOrderId}|${paymentId}`);
    return eqHex(expected, signature);
  },

  async fetchPayment(paymentId) {
    const p = await call<{ id: string; order_id: string | null; amount: number; status: PaymentInfo["status"] }>(
      "GET",
      `/v1/payments/${encodeURIComponent(paymentId)}`,
    );
    return { id: p.id, orderId: p.order_id, amountPaise: p.amount, status: p.status };
  },

  async capture(paymentId, amountPaise) {
    await call("POST", `/v1/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" });
  },

  async transfer(paymentId, accountId, amountPaise, notes) {
    const r = await call<{ items: { id: string }[] }>(
      "POST",
      `/v1/payments/${encodeURIComponent(paymentId)}/transfers`,
      { transfers: [{ account: accountId, amount: amountPaise, currency: "INR", notes, on_hold: false }] },
      `trf-${paymentId}`,
    );
    return r.items[0].id;
  },

  async refund(paymentId, amountPaise, notes) {
    const r = await call<{ id: string }>(
      "POST",
      `/v1/payments/${encodeURIComponent(paymentId)}/refund`,
      { amount: amountPaise, speed: "normal", notes },
      `rfnd-${paymentId}`,
    );
    return r.id;
  },

  async createLinkedAccount(i) {
    // 1. Linked account
    const acc = await call<{ id: string }>("POST", "/v2/accounts", {
      email: i.email,
      phone: i.phone.replace(/^\+91/, ""),
      type: "route",
      reference_id: i.userId.slice(0, 20),
      legal_business_name: i.name,
      business_type: "individual",
      contact_name: i.name,
      profile: {
        category: "ecommerce",
        subcategory: "classified",
        addresses: { registered: { street1: i.street, street2: i.street, city: i.city, state: i.state, postal_code: i.postalCode, country: "IN" } },
      },
    });
    // 2. Stakeholder
    await call("POST", `/v2/accounts/${acc.id}/stakeholders`, { name: i.name, email: i.email });
    // 3. Request Route product, 4. add bank settlement details
    const prod = await call<{ id: string }>("POST", `/v2/accounts/${acc.id}/products`, { product_name: "route", tnc_accepted: true });
    const upd = await call<{ activation_status: string }>("PATCH", `/v2/accounts/${acc.id}/products/${prod.id}`, {
      settlements: { account_number: i.accountNumber, ifsc_code: i.ifsc, beneficiary_name: i.name },
      tnc_accepted: true,
    });
    return { accountId: acc.id, active: upd.activation_status === "activated" };
  },

  verifyWebhook(rawBody, signature) {
    const secret = config().RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    return eqHex(hmacHex(secret, rawBody), signature);
  },
};
