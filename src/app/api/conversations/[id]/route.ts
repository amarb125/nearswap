import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { maskContactInfo } from "@/lib/mask";
import { rateLimit } from "@/lib/ratelimit";
import { imageUrl } from "@/lib/storage";
import { publicUser } from "@/lib/views";
import { ACTIVE_STATUSES, orderView } from "@/lib/orders";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, userId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id }, include: { listing: true, buyer: true, seller: true } });
  if (!conv || (conv.buyerId !== userId && conv.sellerId !== userId)) throw new HttpError(404, "Conversation not found");
  return conv;
}

export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  const conv = await load(id, u.id);
  const after = req.nextUrl.searchParams.get("after");
  const messages = await prisma.message.findMany({
    where: { conversationId: id, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const order = await prisma.order.findFirst({
    where: { listingId: conv.listingId, buyerId: conv.buyerId, status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
  return ok({
    id: conv.id,
    role: conv.buyerId === u.id ? "buyer" : "seller",
    listing: { id: conv.listing.id, title: conv.listing.title, image: conv.listing.images[0] ? imageUrl(conv.listing.images[0]) : null, pricePaise: conv.listing.pricePaise, status: conv.listing.status },
    other: publicUser(conv.buyerId === u.id ? conv.seller : conv.buyer),
    order: order ? orderView(order, u.id) : null,
    contactsUnlocked: order?.status === "PAID",
    messages: messages.map((m) => ({ id: m.id, mine: m.senderId === u.id && !m.system, system: m.system, body: m.body, masked: m.masked, createdAt: m.createdAt })),
  });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  await rateLimit(`msg:${u.id}`, 60, 60);
  const conv = await load(id, u.id);
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(1000) }));
  // Contact details stay hidden until the buyer has paid into escrow.
  const paid = await prisma.order.count({ where: { listingId: conv.listingId, buyerId: conv.buyerId, status: "PAID" } });
  const { text: safe, masked } = paid ? { text, masked: false } : maskContactInfo(text);
  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { conversationId: id, senderId: u.id, body: safe, masked } });
    await tx.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    return m;
  });
  return ok({
    message: { id: msg.id, mine: true, system: false, body: msg.body, masked, createdAt: msg.createdAt },
    notice: masked ? "Contact details are hidden until the item is reserved and paid for. This protects you from scams." : undefined,
  });
});
