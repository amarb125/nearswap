import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  await rateLimit(`report:${u.id}`, 20, 86400);
  const { reason } = await body(req, z.object({ reason: z.string().trim().min(5).max(500) }));
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw new HttpError(404, "Listing not found");
  await prisma.report.create({ data: { reporterId: u.id, listingId: id, reason } });
  return ok({ ok: true });
});
