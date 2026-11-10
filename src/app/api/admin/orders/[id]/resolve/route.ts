import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { resolveDispute, settle } from "@/lib/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await requireAdmin();
  const input = await body(
    req,
    z.object({ resolution: z.enum(["PAY_SELLER", "REFUND_BUYER", "BUYER_NO_SHOW", "SELLER_NO_SHOW", "RETRY_SETTLEMENT"]), note: z.string().max(500).default("") }),
  );
  if (input.resolution === "RETRY_SETTLEMENT") return ok(await settle(id));
  const order = await resolveDispute(admin.id, id, input.resolution, input.note);
  return ok({ status: order.status });
});
