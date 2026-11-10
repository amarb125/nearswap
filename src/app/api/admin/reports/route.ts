import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, ok, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

export const GET = route(async () => {
  await requireAdmin();
  const reports = await prisma.report.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { listing: { include: { seller: true } }, reporter: true },
  });
  return ok({
    items: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt,
      reporter: r.reporter.name,
      listing: r.listing && { id: r.listing.id, title: r.listing.title, status: r.listing.status, sellerId: r.listing.sellerId, sellerName: r.listing.seller.name },
    })),
  });
});

export const POST = route(async (req) => {
  await requireAdmin();
  const { reportId, removeListing } = await body(req, z.object({ reportId: z.string(), removeListing: z.boolean() }));
  const r = await prisma.report.update({ where: { id: reportId }, data: { resolvedAt: new Date() } });
  if (removeListing && r.listingId) await prisma.listing.updateMany({ where: { id: r.listingId, status: "ACTIVE" }, data: { status: "REMOVED" } });
  return ok({ ok: true });
});
