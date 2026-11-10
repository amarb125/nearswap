import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { payments } from "@/lib/payments";
import { settle } from "@/lib/orders";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  email: z.string().trim().email(),
  accountNumber: z.string().regex(/^\d{9,18}$/, "Account number must be 9–18 digits"),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
  street: z.string().trim().min(5).max(100),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  postalCode: z.string().regex(/^\d{6}$/, "PIN code must be 6 digits"),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  await rateLimit(`payout:${u.id}`, 5, 86400);
  if (u.payoutStatus === "ACTIVE") throw new HttpError(409, "Payouts are already set up. Contact support to change your bank account.");
  const input = await body(req, schema);
  let result;
  try {
    result = await payments().createLinkedAccount({ ...input, userId: u.id, phone: u.phone });
  } catch (e) {
    console.error("linked account failed", e);
    await prisma.user.update({ where: { id: u.id }, data: { payoutStatus: "FAILED" } });
    throw new HttpError(502, "Couldn't verify your bank details with our payment partner. Check them and try again.");
  }
  await prisma.user.update({
    where: { id: u.id },
    data: { payoutAccountId: result.accountId, payoutAccountLast4: input.accountNumber.slice(-4), payoutStatus: result.active ? "ACTIVE" : "PENDING" },
  });
  // Release any completed sales that were waiting for this
  if (result.active) {
    const waiting = await prisma.order.findMany({ where: { sellerId: u.id, settledAt: null, closedAt: { not: null } }, select: { id: true } });
    for (const o of waiting) await settle(o.id);
  }
  return ok({ payoutStatus: result.active ? "ACTIVE" : "PENDING" });
});
