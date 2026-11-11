import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { runMaintenance } from "@/lib/orders";
import { prisma } from "@/lib/db";
import { recordJobFailure, recordJobSuccess } from "@/lib/jobs";

/** Call every 5 minutes: `curl -H "Authorization: Bearer $CRON_SECRET" -X POST $APP_URL/api/cron` */
async function handle(req: NextRequest) {
  const secret = config().CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const valid = secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!valid) return new Response("unauthorized", { status: 401 });
  try {
    const stats = await runMaintenance();
    // housekeeping
    const now = new Date();
    await prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86400_000) } } });
    await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
    await recordJobSuccess("cron");
    return Response.json({ ok: true, ...stats });
  } catch (e) {
    console.error("[cron] maintenance failed", e);
    await recordJobFailure("cron", e).catch(() => {});
    throw e;
  }
}
export const GET = handle;
export const POST = handle;
