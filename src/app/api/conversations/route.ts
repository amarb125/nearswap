import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { imageUrl } from "@/lib/storage";
import { publicUser } from "@/lib/views";

export const GET = route(async () => {
  const u = await requireUser();
  const convs = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: u.id }, { sellerId: u.id }] },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      listing: true,
      buyer: true,
      seller: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return ok({
    items: convs.map((c) => ({
      id: c.id,
      listing: { id: c.listing.id, title: c.listing.title, image: c.listing.images[0] ? imageUrl(c.listing.images[0]) : null, pricePaise: c.listing.pricePaise, status: c.listing.status },
      other: publicUser(c.buyerId === u.id ? c.seller : c.buyer),
      role: c.buyerId === u.id ? "buyer" : "seller",
      lastMessage: c.messages[0]?.body ?? null,
      lastMessageAt: c.lastMessageAt,
    })),
  });
});

/** Buyer starts (or reopens) a chat about a listing. */
export const POST = route(async (req) => {
  const u = await requireUser();
  const { listingId } = await body(req, z.object({ listingId: z.string() }));
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status === "REMOVED") throw new HttpError(404, "Listing not found");
  if (listing.sellerId === u.id) throw new HttpError(400, "This is your own listing");
  const conv = await prisma.conversation.upsert({
    where: { listingId_buyerId: { listingId, buyerId: u.id } },
    create: { listingId, buyerId: u.id, sellerId: listing.sellerId },
    update: {},
  });
  return ok({ id: conv.id });
});
