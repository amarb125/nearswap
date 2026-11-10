export interface CreateOrderInput {
  orderId: string;
  amountPaise: number;
  description: string;
}

export interface CheckoutInfo {
  provider: "mock" | "razorpay";
  providerOrderId: string;
  amountPaise: number;
  keyId?: string; // razorpay public key for Checkout.js
}

export interface PaymentInfo {
  id: string;
  orderId: string | null;
  amountPaise: number;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
}

export interface LinkedAccountInput {
  userId: string;
  name: string;
  email: string;
  phone: string;
  accountNumber: string;
  ifsc: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface PaymentProvider {
  name: "mock" | "razorpay";
  createOrder(input: CreateOrderInput): Promise<CheckoutInfo>;
  /** Verifies the signature returned by the client-side checkout. */
  verifyCheckoutSignature(providerOrderId: string, paymentId: string, signature: string): boolean;
  fetchPayment(paymentId: string): Promise<PaymentInfo>;
  capture(paymentId: string, amountPaise: number): Promise<void>;
  /** Moves money held in the platform account to the seller's linked account. */
  transfer(paymentId: string, accountId: string, amountPaise: number, notes: Record<string, string>): Promise<string>;
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<string>;
  createLinkedAccount(input: LinkedAccountInput): Promise<{ accountId: string; active: boolean }>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}
