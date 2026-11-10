import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { orderView, reserve } from "@/lib/orders";
import { rateLimit } from "@/lib/ratelimit";
import { imageUrl } from "@/lib/storage";
import { publicUser } from "@/lib/views";

export const GET = route(async (req) => {
  const u = await requireUser();
  const role = req.nextUrl.searchParams.get("role");
  const where = role === "buyer" ? { buyerId: u.id } : role === "seller" ? { sellerId: u.id } : { OR: [{ buyerId: u.id }, { sellerId: u.id }] };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { listing: true, buyer: true, seller: true },
  });
  return ok({
    items: orders.map((o) => ({
      ...orderView(o, u.id),
      listing: { id: o.listing.id, title: o.listing.title, image: o.listing.images[0] ? imageUrl(o.listing.images[0]) : null },
      other: publicUser(o.buyerId === u.id ? o.seller : o.buyer),
    })),
  });
});

/** Reserve an item: locks it and returns checkout details for paying into escrow. */
export const POST = route(async (req) => {
  const u = await requireUser();
  if (!u.name) throw new HttpError(400, "Complete your profile first", "PROFILE_INCOMPLETE");
  await rateLimit(`reserve:${u.id}`, 10, 3600);
  const { listingId } = await body(req, z.object({ listingId: z.string() }));
  const { order, checkout } = await reserve(u, listingId);
  return ok({ orderId: order.id, checkout }, { status: 201 });
});
