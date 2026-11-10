import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

export const GET = route(async () => {
  await requireAdmin();
  const since = new Date(Date.now() - 30 * 86400_000);
  const [users, activeListings, completed, revenue, gmv, disputes, unsettled, offPlatform] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.order.count({ where: { status: "COMPLETED", completedAt: { gte: since } } }),
    prisma.order.aggregate({ _sum: { feePaise: true }, where: { status: "COMPLETED", completedAt: { gte: since } } }),
    prisma.order.aggregate({ _sum: { pricePaise: true }, where: { status: "COMPLETED", completedAt: { gte: since } } }),
    prisma.order.count({ where: { status: "DISPUTED" } }),
    prisma.order.count({ where: { settledAt: null, closedAt: { not: null } } }),
    prisma.listing.count({ where: { soldOffPlatform: true, updatedAt: { gte: since } } }),
  ]);
  return ok({
    users,
    activeListings,
    completed30d: completed,
    revenue30dPaise: revenue._sum.feePaise ?? 0,
    gmv30dPaise: gmv._sum.pricePaise ?? 0,
    openDisputes: disputes,
    unsettledOrders: unsettled,
    soldOffPlatform30d: offPlatform,
  });
});
