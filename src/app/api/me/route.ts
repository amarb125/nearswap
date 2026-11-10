import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, ok, route } from "@/lib/http";
import { currentUser, requireUser } from "@/lib/auth";
import { publicUser } from "@/lib/views";

export const GET = route(async () => {
  const u = await currentUser();
  if (!u) return ok({ user: null });
  const actionNeeded = await prisma.order.count({
    where: { OR: [{ buyerId: u.id }, { sellerId: u.id }], status: { in: ["PAID", "DISPUTED"] } },
  });
  return ok({
    user: {
      ...publicUser(u),
      phoneLast4: u.phone.slice(-4),
      role: u.role,
      payoutStatus: u.payoutStatus,
      payoutAccountLast4: u.payoutAccountLast4,
      strikes: u.strikes,
      activeOrders: actionNeeded,
    },
  });
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const input = await body(req, z.object({ name: z.string().trim().min(2).max(40), city: z.string().trim().min(2).max(60) }));
  await prisma.user.update({ where: { id: u.id }, data: input });
  return ok({ ok: true });
});
