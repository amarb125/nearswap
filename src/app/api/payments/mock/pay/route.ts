import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { mockSignature } from "@/lib/payments/mock";

/** DEV ONLY: simulates the gateway's checkout success callback. */
export const POST = route(async (req) => {
  if (config().PAYMENT_PROVIDER !== "mock" || config().NODE_ENV === "production") throw new HttpError(404, "Not found");
  const u = await requireUser();
  const { orderId } = await body(req, z.object({ orderId: z.string() }));
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== u.id || !order.providerOrderId) throw new HttpError(404, "Order not found");
  const paymentId = `mock_pay_${order.providerOrderId}_${order.pricePaise}`;
  return ok({ paymentId, signature: mockSignature(order.providerOrderId, paymentId) });
});
