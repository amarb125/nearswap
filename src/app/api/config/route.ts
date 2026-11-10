import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export function GET() {
  const c = config();
  return Response.json({
    feeBps: c.FEE_BPS, feeMinPaise: c.FEE_MIN_PAISE, feeMaxPaise: c.FEE_MAX_PAISE,
    noShowCompBps: c.NOSHOW_COMP_BPS, noShowCompMaxPaise: c.NOSHOW_COMP_MAX_PAISE,
    paymentWindowMinutes: c.PAYMENT_WINDOW_MINUTES, meetupDeadlineHours: c.MEETUP_DEADLINE_HOURS,
    noShowContestHours: c.NOSHOW_CONTEST_HOURS, paymentProvider: c.PAYMENT_PROVIDER,
  });
}
