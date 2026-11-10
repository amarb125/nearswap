import { Prisma, type Order, type OrderStatus, type User } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";
import { HttpError } from "./http";
import { computeFee, computeNoShowCompensation, formatINR } from "./money";
import { decrypt, encrypt, hmac, randomDigits, safeEqualHex } from "./crypto";
import { payments } from "./payments";

/**
 * ORDER LIFECYCLE (escrow + handover code)
 *
 *  PENDING_PAYMENT --pay--> PAID --buyer gives code, seller enters it--> COMPLETED   (seller paid minus fee)
 *        |                    |--buyer rejects after inspection-------> REJECTED    (full refund)
 *        |                    |--either cancels before meetup---------> CANCELLED   (full refund)
 *        |                    |--no-show reported & not contested-----> SELLER_NO_SHOW (full refund, seller strike)
 *        |                    |                                     \-> BUYER_NO_SHOW  (refund minus small compensation to seller)
 *        |                    |--dispute / contested no-show----------> DISPUTED    (admin decides)
 *        |                    \--deadline passes, nobody acted--------> EXPIRED     (full refund)
 *        \--payment window passes----------------------------------> EXPIRED     (nothing charged)
 *
 * Every transition is a conditional UPDATE ... WHERE status = <expected>, so concurrent
 * requests (double clicks, webhook + client callback racing, cron) can never apply twice.
 * Money movements happen after the state change, via settle(), which is idempotent and
 * retried by cron until it succeeds.
 */

export const ACTIVE_STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "DISPUTED"];
const MAX_CODE_ATTEMPTS = 5;
const CODE_LOCK_MINUTES = 15;
const MAX_OPEN_ORDERS_PER_BUYER = 3;

type Tx = Prisma.TransactionClient;

async function logEvent(tx: Tx, orderId: string, actorId: string | null, type: string, data?: Prisma.InputJsonValue) {
  await tx.orderEvent.create({ data: { orderId, actorId, type, data } });
}

/** Posts a system message into the buyer/seller conversation so both see the timeline. */
async function systemMessage(tx: Tx, order: Pick<Order, "listingId" | "buyerId" | "sellerId">, body: string) {
  const conv = await tx.conversation.upsert({
    where: { listingId_buyerId: { listingId: order.listingId, buyerId: order.buyerId } },
    create: { listingId: order.listingId, buyerId: order.buyerId, sellerId: order.sellerId },
    update: { lastMessageAt: new Date() },
  });
  await tx.message.create({ data: { conversationId: conv.id, senderId: order.sellerId, body, system: true } });
}

/** Atomically move an order from one of `from` to `to`; throws 409 if it was already moved. */
async function transition(tx: Tx, orderId: string, from: OrderStatus[], data: Prisma.OrderUpdateManyMutationInput) {
  const r = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data });
  if (r.count !== 1) throw new HttpError(409, "This order has changed. Please refresh.");
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}

async function loadForParty(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || (order.buyerId !== userId && order.sellerId !== userId)) throw new HttpError(404, "Order not found");
  return order;
}

function hashCode(orderId: string, code: string) {
  return hmac(`${orderId}:${code}`, "handover");
}

// ---------------------------------------------------------------------------------------
// 1. Reserve: buyer locks the item and gets a checkout to pay into escrow
// ---------------------------------------------------------------------------------------
export async function reserve(buyer: User, listingId: string) {
  const c = config();
  if (buyer.rejectionsAsBuyer + buyer.noShowsAsBuyer >= 5 && buyer.rejectionsAsBuyer + buyer.noShowsAsBuyer > buyer.completedBuys * 2)
    throw new HttpError(403, "Your account can't reserve items right now because of too many rejected or missed meetups. Contact support.");

  const open = await prisma.order.count({ where: { buyerId: buyer.id, status: { in: ACTIVE_STATUSES } } });
  if (open >= MAX_OPEN_ORDERS_PER_BUYER) throw new HttpError(429, `You can have at most ${MAX_OPEN_ORDERS_PER_BUYER} open reservations.`);

  const order = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: listingId }, include: { seller: true } });
    if (!listing || listing.status === "REMOVED") throw new HttpError(404, "Listing not found");
    if (listing.sellerId === buyer.id) throw new HttpError(400, "You can't buy your own item");
    if (listing.seller.bannedAt) throw new HttpError(410, "This listing is no longer available");

    const locked = await tx.listing.updateMany({ where: { id: listingId, status: "ACTIVE" }, data: { status: "RESERVED" } });
    if (locked.count !== 1) throw new HttpError(409, "Someone else has just reserved this item.");

    const fee = computeFee(listing.pricePaise, { feeBps: c.FEE_BPS, feeMinPaise: c.FEE_MIN_PAISE, feeMaxPaise: c.FEE_MAX_PAISE });
    const o = await tx.order.create({
      data: {
        listingId,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        pricePaise: listing.pricePaise,
        feePaise: fee,
        sellerPayoutPaise: listing.pricePaise - fee,
        paymentExpiresAt: new Date(Date.now() + c.PAYMENT_WINDOW_MINUTES * 60_000),
      },
    });
    await logEvent(tx, o.id, buyer.id, "RESERVED");
    return o;
  });

  try {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    const checkout = await payments().createOrder({ orderId: order.id, amountPaise: order.pricePaise, description: listing.title });
    await prisma.order.update({ where: { id: order.id }, data: { providerOrderId: checkout.providerOrderId } });
    return { order: { ...order, providerOrderId: checkout.providerOrderId }, checkout };
  } catch (e) {
    // Couldn't create the payment order: release the item immediately.
    await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { status: "EXPIRED", closedAt: new Date(), settledAt: new Date() } });
      await tx.listing.updateMany({ where: { id: listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    });
    console.error("createOrder failed", e);
    throw new HttpError(502, "Payment service is unavailable. Please try again.");
  }
}

/** Re-open checkout for an order still waiting for payment. */
export async function checkoutFor(order: Order) {
  if (order.status !== "PENDING_PAYMENT" || !order.providerOrderId) throw new HttpError(409, "This order is not awaiting payment");
  const c = config();
  return {
    provider: payments().name,
    providerOrderId: order.providerOrderId,
    amountPaise: order.pricePaise,
    keyId: c.PAYMENT_PROVIDER === "razorpay" ? c.RAZORPAY_KEY_ID : undefined,
  };
}

// ---------------------------------------------------------------------------------------
// 2. Payment confirmation (from client callback AND from webhook — whichever comes first)
// ---------------------------------------------------------------------------------------
export async function confirmPayment(providerOrderId: string, paymentId: string, source: "client" | "webhook") {
  const order = await prisma.order.findUnique({ where: { providerOrderId } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.providerPaymentId === paymentId && order.status !== "PENDING_PAYMENT") return order; // already processed

  const p = payments();
  const info = await p.fetchPayment(paymentId);
  if (info.orderId !== providerOrderId) throw new HttpError(400, "Payment does not belong to this order");
  if (info.amountPaise !== order.pricePaise) throw new HttpError(400, "Payment amount mismatch");
  if (info.status === "authorized") await p.capture(paymentId, order.pricePaise);
  else if (info.status !== "captured") throw new HttpError(402, "Payment not completed");

  const c = config();
  const code = randomDigits(6);

  try {
    return await prisma.$transaction(async (tx) => {
      const paid = await transition(tx, order.id, ["PENDING_PAYMENT"], {
        status: "PAID",
        providerPaymentId: paymentId,
        paidAt: new Date(),
        deadlineAt: new Date(Date.now() + c.MEETUP_DEADLINE_HOURS * 3600_000),
        handoverCodeHash: hashCode(order.id, code),
        handoverCodeEnc: encrypt(code),
      });
      await logEvent(tx, order.id, source === "client" ? order.buyerId : null, "PAID", { paymentId, source });
      await systemMessage(
        tx,
        order,
        `✅ Payment of ${formatINR(order.pricePaise)} is held safely in escrow. Agree on a public meetup place and time. ` +
          `Buyer: inspect the item, then show your handover code to the seller. Seller: don't hand over the item until you've entered the code.`,
      );
      return paid;
    });
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
    // The order was no longer PENDING_PAYMENT (e.g. reservation expired / cancelled before the
    // payment landed). Money was taken, so record it and refund it in full.
    const late = await prisma.order.updateMany({
      where: { id: order.id, providerPaymentId: null, status: { in: ["EXPIRED", "CANCELLED"] } },
      data: { providerPaymentId: paymentId, refundPaise: order.pricePaise, settledAt: null },
    });
    if (late.count === 1) {
      await prisma.orderEvent.create({ data: { orderId: order.id, type: "LATE_PAYMENT_REFUND", data: { paymentId } } });
      await settle(order.id);
      throw new HttpError(410, "This reservation expired before your payment completed. Your money is being refunded in full.");
    }
    return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  }
}

// ---------------------------------------------------------------------------------------
// 3. Meetup details (either party)
// ---------------------------------------------------------------------------------------
export async function setMeetup(userId: string, orderId: string, place: string, at: Date) {
  const order = await loadForParty(orderId, userId);
  if (order.status !== "PAID") throw new HttpError(409, "Meetup can only be set for paid orders");
  if (order.deadlineAt && at > order.deadlineAt) throw new HttpError(400, "Meetup must be before the order deadline");
  if (at.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, "Meetup time is in the past");
  return prisma.$transaction(async (tx) => {
    const o = await transition(tx, orderId, ["PAID"], { meetupPlace: place, meetupAt: at });
    await logEvent(tx, orderId, userId, "MEETUP_SET", { place, at: at.toISOString() });
    await systemMessage(tx, order, `📍 Meetup set: ${place}, ${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`);
    return o;
  });
}

// ---------------------------------------------------------------------------------------
// 4. Handover code — buyer views it, seller enters it
// ---------------------------------------------------------------------------------------
export async function revealCode(userId: string, orderId: string): Promise<string> {
  const order = await loadForParty(orderId, userId);
  if (order.buyerId !== userId) throw new HttpError(403, "Only the buyer can see the handover code");
  if (order.status !== "PAID" || !order.handoverCodeEnc) throw new HttpError(409, "No active handover code");
  return decrypt(order.handoverCodeEnc);
}

export async function completeWithCode(sellerId: string, orderId: string, code: string) {
  const order = await loadForParty(orderId, sellerId);
  if (order.sellerId !== sellerId) throw new HttpError(403, "Only the seller enters the handover code");
  if (order.status !== "PAID") throw new HttpError(409, "This order is not awaiting handover");
  if (order.codeLockedUntil && order.codeLockedUntil > new Date())
    throw new HttpError(429, "Too many wrong attempts. Code entry is locked for a few minutes.");

  const valid = !!order.handoverCodeHash && /^\d{6}$/.test(code) && safeEqualHex(hashCode(orderId, code), order.handoverCodeHash);
  if (!valid) {
    const attempts = order.codeAttempts + 1;
    const lock = attempts >= MAX_CODE_ATTEMPTS;
    await prisma.order.update({
      where: { id: orderId },
      data: { codeAttempts: lock ? 0 : attempts, codeLockedUntil: lock ? new Date(Date.now() + CODE_LOCK_MINUTES * 60_000) : undefined },
    });
    await prisma.orderEvent.create({ data: { orderId, actorId: sellerId, type: "WRONG_CODE", data: { attempts } } });
    throw new HttpError(400, lock ? "Wrong code. Too many attempts — locked for 15 minutes." : `Wrong code. ${MAX_CODE_ATTEMPTS - attempts} attempts left.`);
  }

  await prisma.$transaction(async (tx) => {
    await transition(tx, orderId, ["PAID"], {
      status: "COMPLETED",
      completedAt: new Date(),
      closedAt: new Date(),
      handoverCodeEnc: null,
      transferPaise: order.sellerPayoutPaise,
      refundPaise: 0,
    });
    await tx.listing.update({ where: { id: order.listingId }, data: { status: "SOLD" } });
    await tx.user.update({ where: { id: order.sellerId }, data: { completedSales: { increment: 1 } } });
    await tx.user.update({ where: { id: order.buyerId }, data: { completedBuys: { increment: 1 } } });
    await logEvent(tx, orderId, sellerId, "COMPLETED");
    await systemMessage(tx, order, `🎉 Handover complete. ${formatINR(order.sellerPayoutPaise)} is on its way to the seller (after ${formatINR(order.feePaise)} platform fee). Please rate each other!`);
  });
  await settle(orderId);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

// ---------------------------------------------------------------------------------------
// 5. Buyer rejects after inspection
// ---------------------------------------------------------------------------------------
export async function rejectItem(buyerId: string, orderId: string, reason: string) {
  const order = await loadForParty(orderId, buyerId);
  if (order.buyerId !== buyerId) throw new HttpError(403, "Only the buyer can reject the item");
  await prisma.$transaction(async (tx) => {
    await transition(tx, orderId, ["PAID"], { status: "REJECTED", rejectReason: reason, closedAt: new Date(), handoverCodeEnc: null, refundPaise: order.pricePaise });
    await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    await tx.user.update({ where: { id: buyerId }, data: { rejectionsAsBuyer: { increment: 1 } } });
    await logEvent(tx, orderId, buyerId, "REJECTED", { reason });
    await systemMessage(tx, order, `↩️ Buyer did not accept the item: "${reason}". Full refund of ${formatINR(order.pricePaise)} issued. The item is listed again.`);
  });
  await settle(orderId);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

// ---------------------------------------------------------------------------------------
// 6. Cancel (before handover)
// ---------------------------------------------------------------------------------------
export async function cancelOrder(userId: string, orderId: string, reason: string) {
  const order = await loadForParty(orderId, userId);
  const byBuyer = order.buyerId === userId;
  if (order.status === "PENDING_PAYMENT" && !byBuyer) throw new HttpError(403, "Only the buyer can cancel an unpaid reservation");
  if (!["PENDING_PAYMENT", "PAID"].includes(order.status)) throw new HttpError(409, "This order can no longer be cancelled");
  const wasPaid = order.status === "PAID";
  // Seller cancelling a paid order (backing out) earns a strike; buyer cancelling counts like a rejection.
  await prisma.$transaction(async (tx) => {
    await transition(tx, orderId, [order.status], {
      status: "CANCELLED",
      cancelReason: `${byBuyer ? "buyer" : "seller"}: ${reason}`,
      closedAt: new Date(),
      handoverCodeEnc: null,
      refundPaise: wasPaid ? order.pricePaise : 0,
      settledAt: wasPaid ? null : new Date(),
    });
    await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    if (wasPaid && byBuyer) await tx.user.update({ where: { id: userId }, data: { rejectionsAsBuyer: { increment: 1 } } });
    if (wasPaid && !byBuyer) await tx.user.update({ where: { id: userId }, data: { strikes: { increment: 1 } } });
    await logEvent(tx, orderId, userId, "CANCELLED", { reason, by: byBuyer ? "buyer" : "seller" });
    await systemMessage(tx, order, `❌ Order cancelled by ${byBuyer ? "buyer" : "seller"}: "${reason}".${wasPaid ? ` Full refund of ${formatINR(order.pricePaise)} issued.` : ""}`);
  });
  if (wasPaid) await settle(orderId);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

// ---------------------------------------------------------------------------------------
// 7. No-shows: reported by one side, the other side can contest within a window
// ---------------------------------------------------------------------------------------
export async function reportNoShow(userId: string, orderId: string) {
  const order = await loadForParty(orderId, userId);
  if (order.status !== "PAID") throw new HttpError(409, "No-shows can only be reported on paid orders");
  if (!order.meetupAt) throw new HttpError(400, "Set a meetup time first — no-shows are measured against it");
  if (Date.now() < order.meetupAt.getTime() + 15 * 60_000) throw new HttpError(400, "You can report a no-show 15 minutes after the meetup time");
  const by = order.buyerId === userId ? "BUYER" : "SELLER";

  if (order.noShowReportedBy && order.noShowReportedBy !== by) {
    // Both say the other didn't come: a human needs to look.
    return openDispute(userId, orderId, "Both parties reported a no-show");
  }
  if (order.noShowReportedBy === by) return order;

  return prisma.$transaction(async (tx) => {
    const o = await transition(tx, orderId, ["PAID"], { noShowReportedBy: by, noShowReportedAt: new Date() });
    await logEvent(tx, orderId, userId, "NO_SHOW_REPORTED", { by });
    await systemMessage(
      tx,
      order,
      `⚠️ The ${by === "BUYER" ? "buyer" : "seller"} reported that the ${by === "BUYER" ? "seller" : "buyer"} did not come to the meetup. ` +
        `If this is wrong, open the order and tap "Contest" within ${config().NOSHOW_CONTEST_HOURS} hours.`,
    );
    return o;
  });
}

/** Called by cron: no-show reports past the contest window become final. */
export async function finalizeNoShow(orderId: string) {
  const c = config();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PAID" || !order.noShowReportedBy) return;
  if (order.buyerId === order.sellerId) return;
  const sellerMissing = order.noShowReportedBy === "BUYER";
  const comp = sellerMissing ? 0 : computeNoShowCompensation(order.pricePaise, c.NOSHOW_COMP_BPS, c.NOSHOW_COMP_MAX_PAISE);

  await prisma.$transaction(async (tx) => {
    await transition(tx, orderId, ["PAID"], {
      status: sellerMissing ? "SELLER_NO_SHOW" : "BUYER_NO_SHOW",
      closedAt: new Date(),
      handoverCodeEnc: null,
      compensationPaise: comp,
      transferPaise: comp,
      refundPaise: order.pricePaise - comp,
    });
    await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    if (sellerMissing) await tx.user.update({ where: { id: order.sellerId }, data: { noShowsAsSeller: { increment: 1 }, strikes: { increment: 1 } } });
    else await tx.user.update({ where: { id: order.buyerId }, data: { noShowsAsBuyer: { increment: 1 } } });
    await logEvent(tx, orderId, null, sellerMissing ? "SELLER_NO_SHOW" : "BUYER_NO_SHOW", { comp });
    await systemMessage(
      tx,
      order,
      sellerMissing
        ? `Seller no-show confirmed. Full refund of ${formatINR(order.pricePaise)} issued to the buyer.`
        : `Buyer no-show confirmed. ${formatINR(comp)} paid to the seller as compensation; ${formatINR(order.pricePaise - comp)} refunded to the buyer.`,
    );
  });
  await settle(orderId);
}

// ---------------------------------------------------------------------------------------
// 8. Disputes
// ---------------------------------------------------------------------------------------
export async function openDispute(userId: string, orderId: string, reason: string) {
  const order = await loadForParty(orderId, userId);
  if (order.status !== "PAID") throw new HttpError(409, "Only active (paid) orders can be disputed");
  return prisma.$transaction(async (tx) => {
    const o = await transition(tx, orderId, ["PAID"], { status: "DISPUTED", disputeReason: reason });
    await logEvent(tx, orderId, userId, "DISPUTED", { reason });
    await systemMessage(tx, order, `🛟 A dispute was opened: "${reason}". The money stays safely in escrow while our team reviews. Please keep all conversation in this chat.`);
    return o;
  });
}

export type DisputeResolution = "PAY_SELLER" | "REFUND_BUYER" | "BUYER_NO_SHOW" | "SELLER_NO_SHOW";

export async function resolveDispute(adminId: string, orderId: string, resolution: DisputeResolution, note: string) {
  const c = config();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DISPUTED") throw new HttpError(409, "Order is not disputed");

  let data: Prisma.OrderUpdateManyMutationInput;
  let msg: string;
  let listingStatus: "SOLD" | "ACTIVE";
  switch (resolution) {
    case "PAY_SELLER":
      data = { status: "COMPLETED", completedAt: new Date(), transferPaise: order.sellerPayoutPaise, refundPaise: 0 };
      msg = `Dispute resolved in favour of the seller. ${formatINR(order.sellerPayoutPaise)} released to the seller.`;
      listingStatus = "SOLD";
      break;
    case "REFUND_BUYER":
      data = { status: "REJECTED", refundPaise: order.pricePaise, transferPaise: 0 };
      msg = `Dispute resolved in favour of the buyer. Full refund of ${formatINR(order.pricePaise)} issued.`;
      listingStatus = "ACTIVE";
      break;
    case "BUYER_NO_SHOW": {
      const comp = computeNoShowCompensation(order.pricePaise, c.NOSHOW_COMP_BPS, c.NOSHOW_COMP_MAX_PAISE);
      data = { status: "BUYER_NO_SHOW", compensationPaise: comp, transferPaise: comp, refundPaise: order.pricePaise - comp };
      msg = `Dispute resolved: buyer no-show. ${formatINR(comp)} compensation to seller, rest refunded.`;
      listingStatus = "ACTIVE";
      break;
    }
    case "SELLER_NO_SHOW":
      data = { status: "SELLER_NO_SHOW", refundPaise: order.pricePaise, transferPaise: 0 };
      msg = `Dispute resolved: seller no-show. Full refund issued.`;
      listingStatus = "ACTIVE";
      break;
  }

  await prisma.$transaction(async (tx) => {
    await transition(tx, orderId, ["DISPUTED"], { ...data, closedAt: new Date(), handoverCodeEnc: null, adminNote: note });
    await tx.listing.update({ where: { id: order.listingId }, data: { status: listingStatus } });
    if (resolution === "PAY_SELLER") {
      await tx.user.update({ where: { id: order.sellerId }, data: { completedSales: { increment: 1 } } });
      await tx.user.update({ where: { id: order.buyerId }, data: { completedBuys: { increment: 1 } } });
    }
    if (resolution === "SELLER_NO_SHOW") await tx.user.update({ where: { id: order.sellerId }, data: { noShowsAsSeller: { increment: 1 }, strikes: { increment: 1 } } });
    if (resolution === "BUYER_NO_SHOW") await tx.user.update({ where: { id: order.buyerId }, data: { noShowsAsBuyer: { increment: 1 } } });
    await logEvent(tx, orderId, adminId, "DISPUTE_RESOLVED", { resolution, note });
    await systemMessage(tx, order, `🛟 ${msg}${note ? ` Note from support: ${note}` : ""}`);
  });
  await settle(orderId);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

// ---------------------------------------------------------------------------------------
// 9. Settlement: execute refunds/transfers owed by a closed order. Idempotent; retried by cron.
// ---------------------------------------------------------------------------------------
export async function settle(orderId: string): Promise<{ done: boolean; error?: string }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { seller: true } });
  if (order.settledAt) return { done: true };
  if (!order.closedAt) return { done: false };
  const now = new Date();
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, settledAt: null, OR: [{ settleLockUntil: null }, { settleLockUntil: { lt: now } }] },
    data: { settleLockUntil: new Date(now.getTime() + 120_000) },
  });
  if (claimed.count !== 1) return { done: false, error: "LOCKED" };
  try {
    return await settleLocked(order);
  } finally {
    await prisma.order.update({ where: { id: orderId }, data: { settleLockUntil: null } });
  }
}

async function settleLocked(order: Order & { seller: User }): Promise<{ done: boolean; error?: string }> {
  const orderId = order.id;
  const p = payments();
  const notes = { orderId: order.id };
  try {
    if (order.refundPaise > 0 && !order.providerRefundId) {
      if (!order.providerPaymentId) throw new Error("No payment to refund");
      const refundId = await p.refund(order.providerPaymentId, order.refundPaise, notes);
      await prisma.order.update({ where: { id: orderId }, data: { providerRefundId: refundId } });
      await prisma.orderEvent.create({ data: { orderId, type: "REFUND_ISSUED", data: { refundId, amount: order.refundPaise } } });
    }
    if (order.transferPaise > 0 && !order.providerTransferId) {
      if (!order.providerPaymentId) throw new Error("No payment to transfer from");
      if (order.seller.payoutStatus !== "ACTIVE" || !order.seller.payoutAccountId) {
        await prisma.order.update({ where: { id: orderId }, data: { settlementError: "WAITING_FOR_SELLER_PAYOUT_SETUP" } });
        return { done: false, error: "WAITING_FOR_SELLER_PAYOUT_SETUP" };
      }
      const transferId = await p.transfer(order.providerPaymentId, order.seller.payoutAccountId, order.transferPaise, notes);
      await prisma.order.update({ where: { id: orderId }, data: { providerTransferId: transferId } });
      await prisma.orderEvent.create({ data: { orderId, type: "PAYOUT_SENT", data: { transferId, amount: order.transferPaise } } });
    }
    await prisma.order.update({ where: { id: orderId }, data: { settledAt: new Date(), settlementError: null } });
    return { done: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("settle failed", orderId, msg);
    await prisma.order.update({ where: { id: orderId }, data: { settlementError: msg.slice(0, 500) } });
    return { done: false, error: msg };
  }
}

// ---------------------------------------------------------------------------------------
// 10. Background maintenance (run every few minutes via /api/cron)
// ---------------------------------------------------------------------------------------
export async function runMaintenance() {
  const c = config();
  const now = new Date();
  const stats = { expiredReservations: 0, expiredDeadlines: 0, noShowsFinalized: 0, settled: 0, settleErrors: 0 };

  // a) unpaid reservations past the payment window -> release item
  const stale = await prisma.order.findMany({ where: { status: "PENDING_PAYMENT", paymentExpiresAt: { lt: now } }, take: 200 });
  for (const o of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        await transition(tx, o.id, ["PENDING_PAYMENT"], { status: "EXPIRED", closedAt: now, settledAt: now });
        await tx.listing.updateMany({ where: { id: o.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
        await logEvent(tx, o.id, null, "PAYMENT_WINDOW_EXPIRED");
      });
      stats.expiredReservations++;
    } catch {}
  }

  // b) no-show reports past the contest window -> final
  const contestCutoff = new Date(now.getTime() - c.NOSHOW_CONTEST_HOURS * 3600_000);
  const noShows = await prisma.order.findMany({ where: { status: "PAID", noShowReportedAt: { lt: contestCutoff } }, take: 200 });
  for (const o of noShows) {
    try {
      await finalizeNoShow(o.id);
      stats.noShowsFinalized++;
    } catch {}
  }

  // c) paid orders past the deadline with nothing reported -> refund buyer
  const overdue = await prisma.order.findMany({ where: { status: "PAID", noShowReportedAt: null, deadlineAt: { lt: now } }, take: 200 });
  for (const o of overdue) {
    try {
      await prisma.$transaction(async (tx) => {
        await transition(tx, o.id, ["PAID"], { status: "EXPIRED", closedAt: now, handoverCodeEnc: null, refundPaise: o.pricePaise });
        await tx.listing.updateMany({ where: { id: o.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
        await logEvent(tx, o.id, null, "DEADLINE_EXPIRED");
        await systemMessage(tx, o, `⌛ The handover didn't happen before the deadline. Full refund of ${formatINR(o.pricePaise)} issued; the item is listed again.`);
      });
      stats.expiredDeadlines++;
    } catch {}
  }

  // d) retry unsettled money movements
  const unsettled = await prisma.order.findMany({ where: { settledAt: null, closedAt: { not: null } }, select: { id: true }, take: 200 });
  for (const o of unsettled) {
    const r = await settle(o.id);
    if (r.done) stats.settled++;
    else stats.settleErrors++;
  }
  return stats;
}

/** Public-safe view of an order for one of its parties. */
export function orderView(order: Order, viewerId: string) {
  const role = order.buyerId === viewerId ? "buyer" : "seller";
  return {
    id: order.id,
    role,
    status: order.status,
    listingId: order.listingId,
    pricePaise: order.pricePaise,
    feePaise: role === "seller" ? order.feePaise : undefined,
    sellerPayoutPaise: role === "seller" ? order.sellerPayoutPaise : undefined,
    refundPaise: order.refundPaise,
    transferPaise: role === "seller" ? order.transferPaise : undefined,
    compensationPaise: order.compensationPaise,
    meetupPlace: order.meetupPlace,
    meetupAt: order.meetupAt,
    paymentExpiresAt: order.paymentExpiresAt,
    deadlineAt: order.deadlineAt,
    noShowReportedBy: order.noShowReportedBy,
    noShowReportedAt: order.noShowReportedAt,
    codeLockedUntil: order.codeLockedUntil,
    rejectReason: order.rejectReason,
    cancelReason: order.cancelReason,
    disputeReason: order.disputeReason,
    adminNote: order.adminNote,
    settled: !!order.settledAt,
    payoutWaitingForSetup: order.settlementError === "WAITING_FOR_SELLER_PAYOUT_SETUP",
    paidAt: order.paidAt,
    completedAt: order.completedAt,
    closedAt: order.closedAt,
    createdAt: order.createdAt,
  };
}

/** Contest a no-show reported against you. */
export async function contestNoShow(userId: string, orderId: string, reason: string) {
  const order = await loadForParty(orderId, userId);
  const me = order.buyerId === userId ? "BUYER" : "SELLER";
  if (order.status !== "PAID" || !order.noShowReportedBy || order.noShowReportedBy === me)
    throw new HttpError(409, "There is no no-show report against you on this order");
  return openDispute(userId, orderId, `No-show contested: ${reason}`);
}
