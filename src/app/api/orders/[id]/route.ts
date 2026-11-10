import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { imageUrl } from "@/lib/storage";
import { publicUser } from "@/lib/views";
import { payments } from "@/lib/payments";
import {
  cancelOrder,
  checkoutFor,
  completeWithCode,
  confirmPayment,
  contestNoShow,
  openDispute,
  orderView,
  rejectItem,
  reportNoShow,
  revealCode,
  setMeetup,
} from "@/lib/orders";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  const o = await prisma.order.findUnique({
    where: { id },
    include: { listing: true, buyer: true, seller: true, reviews: true, events: { orderBy: { createdAt: "asc" } } },
  });
  if (!o || (o.buyerId !== u.id && o.sellerId !== u.id)) throw new HttpError(404, "Order not found");
  const conv = await prisma.conversation.findUnique({ where: { listingId_buyerId: { listingId: o.listingId, buyerId: o.buyerId } } });
  return ok({
    order: orderView(o, u.id),
    listing: { id: o.listing.id, title: o.listing.title, image: o.listing.images[0] ? imageUrl(o.listing.images[0]) : null, area: o.listing.area, city: o.listing.city },
    other: publicUser(o.buyerId === u.id ? o.seller : o.buyer),
    conversationId: conv?.id ?? null,
    myReview: o.reviews.find((r) => r.authorId === u.id) ?? null,
    timeline: o.events.map((e) => ({ type: e.type, at: e.createdAt, byMe: e.actorId === u.id, system: !e.actorId })),
  });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout") }),
  z.object({ action: z.literal("confirm_payment"), paymentId: z.string().min(5).max(100), signature: z.string().min(10).max(200) }),
  z.object({ action: z.literal("meetup"), place: z.string().trim().min(3).max(150), at: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("reveal_code") }),
  z.object({ action: z.literal("complete"), code: z.string().trim() }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(5).max(300) }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("no_show") }),
  z.object({ action: z.literal("contest"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("dispute"), reason: z.string().trim().min(10).max(1000) }),
  z.object({ action: z.literal("review"), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }),
]);

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  await rateLimit(`order-action:${u.id}`, 60, 60);
  const input = await body(req, actionSchema);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || (order.buyerId !== u.id && order.sellerId !== u.id)) throw new HttpError(404, "Order not found");
  const view = async () => orderView(await prisma.order.findUniqueOrThrow({ where: { id } }), u.id);

  switch (input.action) {
    case "checkout":
      if (order.buyerId !== u.id) throw new HttpError(403, "Only the buyer can pay");
      return ok({ checkout: await checkoutFor(order) });
    case "confirm_payment": {
      if (order.buyerId !== u.id) throw new HttpError(403, "Only the buyer can pay");
      if (!order.providerOrderId || !payments().verifyCheckoutSignature(order.providerOrderId, input.paymentId, input.signature))
        throw new HttpError(400, "Payment verification failed");
      await confirmPayment(order.providerOrderId, input.paymentId, "client");
      return ok({ order: await view() });
    }
    case "meetup":
      await setMeetup(u.id, id, input.place, new Date(input.at));
      return ok({ order: await view() });
    case "reveal_code":
      return ok({ code: await revealCode(u.id, id) });
    case "complete":
      await rateLimit(`code:${id}`, 10, 600);
      await completeWithCode(u.id, id, input.code);
      return ok({ order: await view() });
    case "reject":
      await rejectItem(u.id, id, input.reason);
      return ok({ order: await view() });
    case "cancel":
      await cancelOrder(u.id, id, input.reason);
      return ok({ order: await view() });
    case "no_show":
      await reportNoShow(u.id, id);
      return ok({ order: await view() });
    case "contest":
      await contestNoShow(u.id, id, input.reason);
      return ok({ order: await view() });
    case "dispute":
      await openDispute(u.id, id, input.reason);
      return ok({ order: await view() });
    case "review": {
      if (!["COMPLETED"].includes(order.status)) throw new HttpError(409, "You can rate after a completed handover");
      const targetId = order.buyerId === u.id ? order.sellerId : order.buyerId;
      await prisma.$transaction(async (tx) => {
        const exists = await tx.review.findUnique({ where: { orderId_authorId: { orderId: id, authorId: u.id } } });
        if (exists) throw new HttpError(409, "You already rated this order");
        await tx.review.create({ data: { orderId: id, authorId: u.id, targetId, rating: input.rating, comment: input.comment || null } });
        await tx.user.update({ where: { id: targetId }, data: { ratingSum: { increment: input.rating }, ratingCount: { increment: 1 } } });
      });
      return ok({ ok: true });
    }
  }
});
