import { config } from "@/lib/config";
import { jobHealth } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * Point an uptime monitor (UptimeRobot, Better Stack, etc.) at this URL: it returns 503 when the
 * escrow maintenance job (/api/cron) has stopped succeeding, so unpaid reservations, deadline
 * refunds and payout retries don't silently stall. Error details stay in the server logs.
 */
export async function GET() {
  try {
    const h = await jobHealth("cron", config().CRON_STALE_MINUTES);
    return Response.json(
      { ok: h.ok, lastSuccessAt: h.lastSuccessAt, reason: h.reason },
      { status: h.ok ? 200 : 503 },
    );
  } catch {
    return Response.json({ ok: false, reason: "health check failed" }, { status: 503 });
  }
}
