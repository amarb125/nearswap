"use client";
import { api } from "./api";

export interface Checkout { provider: "mock" | "razorpay"; providerOrderId: string; amountPaise: number; keyId?: string }

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payment page. Check your connection."));
    document.body.appendChild(s);
  });
}

/** Opens the payment gateway; resolves once the server has confirmed the payment. */
export async function pay(orderId: string, checkout: Checkout, opts: { title: string }): Promise<void> {
  if (checkout.provider === "mock") {
    if (!window.confirm(`TEST MODE\n\nSimulate paying ₹${(checkout.amountPaise / 100).toFixed(2)} into escrow?`)) throw new Error("Payment cancelled");
    const sim = await api<{ paymentId: string; signature: string }>("/api/payments/mock/pay", { body: { orderId } });
    await api(`/api/orders/${orderId}`, { body: { action: "confirm_payment", ...sim } });
    return;
  }
  await loadRazorpay();
  await new Promise<void>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: checkout.keyId,
      amount: checkout.amountPaise,
      currency: "INR",
      order_id: checkout.providerOrderId,
      name: process.env.NEXT_PUBLIC_APP_NAME ?? "Nearswap",
      description: `Escrow for: ${opts.title}`.slice(0, 250),
      theme: { color: "#059669" },
      handler: async (r: { razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          await api(`/api/orders/${orderId}`, { body: { action: "confirm_payment", paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } });
          resolve();
        } catch (e) { reject(e); }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.on("payment.failed", () => reject(new Error("Payment failed. No money was taken — please try again.")));
    rzp.open();
  });
}
