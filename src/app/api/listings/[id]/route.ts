import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { currentUser, requireUser } from "@/lib/auth";
import { listingView } from "@/lib/views";
import { prohibitedTerm } from "@/lib/listings";
import { ACTIVE_STATUSES, orderView } from "@/lib/orders";
import { config } from "@/lib/config";
import { computeFee } from "@/lib/money";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({ where: { id }, include: { seller: true } });
  if (!listing || listing.status === "REMOVED" || listing.seller.bannedAt) throw new HttpError(404, "Listing not found");
  const me = await currentUser();
  let myOrder = null;
  if (me) {
    const o = await prisma.order.findFirst({
      where: { listingId: id, status: { in: ACTIVE_STATUSES }, OR: [{ buyerId: me.id }, { sellerId: me.id }] },
      orderBy: { createdAt: "desc" },
    });
    if (o) myOrder = orderView(o, me.id);
  }
  const c = config();
  const isOwner = me?.id === listing.sellerId;
  return ok({
    listing: listingView(listing),
    isOwner,
    myOrder,
    feePreviewPaise: isOwner ? computeFee(listing.pricePaise, { feeBps: c.FEE_BPS, feeMinPaise: c.FEE_MIN_PAISE, feeMaxPaise: c.FEE_MAX_PAISE }) : undefined,
  });
});

const patchSchema = z.object({
  title: z.string().trim().min(4).max(80).optional(),
  description: z.string().trim().min(10).max(2000).optional(),
  pricePaise: z.number().int().min(1000).optional(),
  action: z.enum(["remove", "sold_elsewhere"]).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  const input = await body(req, patchSchema);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.sellerId !== u.id) throw new HttpError(404, "Listing not found");
  if (listing.status !== "ACTIVE") throw new HttpError(409, "Only active listings (not reserved or sold) can be changed");

  if (input.action) {
    // Atomic: can't remove an item someone is reserving at this moment.
    const r = await prisma.listing.updateMany({
      where: { id, status: "ACTIVE" },
      data: input.action === "remove" ? { status: "REMOVED" } : { status: "SOLD", soldOffPlatform: true },
    });
    if (r.count !== 1) throw new HttpError(409, "This item was just reserved by a buyer");
    let nudge: string | undefined;
    if (input.action === "sold_elsewhere") {
      nudge = "Got it. Next time, sell through the app: you get guaranteed payment, no-show compensation, and the sale counts towards your verified-seller rating.";
    }
    return ok({ ok: true, nudge });
  }

  if (input.pricePaise && input.pricePaise > config().MAX_PRICE_PAISE) throw new HttpError(400, "Price is above the maximum allowed");
  const bad = prohibitedTerm(`${input.title ?? ""} ${input.description ?? ""}`);
  if (bad) throw new HttpError(400, `Items like "${bad}" can't be sold on this platform.`);
  const r = await prisma.listing.updateMany({
    where: { id, status: "ACTIVE" },
    data: { title: input.title, description: input.description, pricePaise: input.pricePaise },
  });
  if (r.count !== 1) throw new HttpError(409, "This item was just reserved by a buyer");
  return ok({ ok: true });
});
