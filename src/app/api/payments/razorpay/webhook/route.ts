import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { payments } from "@/lib/payments";
import { confirmPayment } from "@/lib/orders";

/**
 * Configure in Razorpay Dashboard → Webhooks: URL = {APP_URL}/api/payments/razorpay/webhook,
 * events: payment.captured, payment.authorized, account.activated / product.route.activated, transfer.failed, refund.failed.
 * This is the safety net: even if the buyer closes the browser right after paying, the order still becomes PAID.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (payments().name !== "razorpay" || !payments().verifyWebhook(raw, sig)) return new Response("invalid signature", { status: 400 });

  const evt = JSON.parse(raw) as {
    event: string;
    payload: Record<string, { entity: Record<string, unknown> }>;
  };
  const eventId = req.headers.get("x-razorpay-event-id");
  if (eventId) {
    const seen = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
    if (seen) return Response.json({ ok: true, duplicate: true });
  }

  try {
    switch (evt.event) {
      case "payment.authorized":
      case "payment.captured": {
        const p = evt.payload.payment.entity as { id: string; order_id?: string };
        if (p.order_id) {
          try {
            await confirmPayment(p.order_id, p.id, "webhook");
          } catch (e) {
            // 410 = late payment that we refund; anything else should be retried by Razorpay
            if (!(e instanceof Error && "status" in e && (e as { status: number }).status === 410)) throw e;
          }
        }
        break;
      }
      case "account.activated":
      case "product.route.activated": {
        const accountId = (evt.payload.account?.entity?.id ?? evt.payload["merchant_product"]?.entity?.["merchant_id"]) as string | undefined;
        if (accountId) await prisma.user.updateMany({ where: { payoutAccountId: accountId }, data: { payoutStatus: "ACTIVE" } });
        break;
      }
      case "transfer.failed":
      case "refund.failed": {
        const ent = evt.payload[evt.event.split(".")[0]].entity as { id: string; notes?: { orderId?: string } };
        const orderId = ent.notes?.orderId;
        if (orderId) {
          const clear = evt.event === "transfer.failed" ? { providerTransferId: null } : { providerRefundId: null };
          await prisma.order.update({ where: { id: orderId }, data: { ...clear, settledAt: null, settlementError: evt.event } });
          await prisma.orderEvent.create({ data: { orderId, type: evt.event.toUpperCase().replace(".", "_"), data: { id: ent.id } } });
        }
        break;
      }
    }
    if (eventId) await prisma.webhookEvent.create({ data: { id: eventId, type: evt.event } }).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    console.error("webhook error", evt.event, e);
    return new Response("error", { status: 500 });
  }
}
