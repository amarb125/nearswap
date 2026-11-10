import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { listingView } from "@/lib/views";

export const GET = route(async () => {
  const u = await requireUser();
  const items = await prisma.listing.findMany({
    where: { sellerId: u.id, status: { not: "REMOVED" } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok({ items: items.map((l) => listingView(l)) });
});
