import { prisma } from "@/lib/db";
import { HttpError, ok, route } from "@/lib/http";
import { listingView, publicUser } from "@/lib/views";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.bannedAt) throw new HttpError(404, "User not found");
  const [reviews, listings] = await Promise.all([
    prisma.review.findMany({ where: { targetId: id }, orderBy: { createdAt: "desc" }, take: 30, include: { author: true } }),
    prisma.listing.findMany({ where: { sellerId: id, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return ok({
    user: publicUser(u),
    reviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, author: r.author.name ?? "Neighbour", createdAt: r.createdAt })),
    listings: listings.map((l) => listingView(l)),
  });
});
