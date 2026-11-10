import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await requireAdmin();
  if (admin.id === id) throw new HttpError(400, "You can't change your own account here");
  const { action } = await body(req, z.object({ action: z.enum(["ban", "unban", "verify_id", "clear_strikes"]) }));
  const data =
    action === "ban" ? { bannedAt: new Date() }
    : action === "unban" ? { bannedAt: null }
    : action === "verify_id" ? { idVerified: true }
    : { strikes: 0 };
  await prisma.user.update({ where: { id }, data });
  if (action === "ban") {
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.listing.updateMany({ where: { sellerId: id, status: "ACTIVE" }, data: { status: "REMOVED" } });
  }
  return ok({ ok: true });
});
