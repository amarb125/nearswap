import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

export const GET = route(async (req) => {
  await requireAdmin();
  const filter = req.nextUrl.searchParams.get("filter") ?? "disputed";
  const where =
    filter === "unsettled" ? { settledAt: null, closedAt: { not: null } }
    : filter === "all" ? {}
    : { status: "DISPUTED" as const };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { listing: true, buyer: true, seller: true, events: { orderBy: { createdAt: "asc" } } },
  });
  const convs = await prisma.conversation.findMany({
    where: { OR: orders.map((o) => ({ listingId: o.listingId, buyerId: o.buyerId })) },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  return ok({
    items: orders.map((o) => ({
      id: o.id,
      status: o.status,
      pricePaise: o.pricePaise,
      feePaise: o.feePaise,
      disputeReason: o.disputeReason,
      noShowReportedBy: o.noShowReportedBy,
      meetupPlace: o.meetupPlace,
      meetupAt: o.meetupAt,
      settlementError: o.settlementError,
      createdAt: o.createdAt,
      listing: { id: o.listing.id, title: o.listing.title },
      buyer: { id: o.buyer.id, name: o.buyer.name, phone: o.buyer.phone, completedBuys: o.buyer.completedBuys, rejections: o.buyer.rejectionsAsBuyer, noShows: o.buyer.noShowsAsBuyer },
      seller: { id: o.seller.id, name: o.seller.name, phone: o.seller.phone, completedSales: o.seller.completedSales, strikes: o.seller.strikes, noShows: o.seller.noShowsAsSeller },
      events: o.events.map((e) => ({ type: e.type, actorId: e.actorId, data: e.data, at: e.createdAt })),
      messages: (convs.find((c) => c.listingId === o.listingId && c.buyerId === o.buyerId)?.messages ?? []).map((m) => ({
        from: m.system ? "system" : m.senderId === o.buyerId ? "buyer" : "seller",
        body: m.body,
        at: m.createdAt,
      })),
    })),
  });
});
