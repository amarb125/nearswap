import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  cancelOrder,
  completeWithCode,
  confirmPayment,
  contestNoShow,
  openDispute,
  rejectItem,
  reportNoShow,
  reserve,
  resolveDispute,
  revealCode,
  runMaintenance,
  setMeetup,
  settle,
} from "@/lib/orders";
import { mockSignature } from "@/lib/payments/mock";
import { mockProvider } from "@/lib/payments/mock";

let n = 0;
async function user(opts: { payout?: boolean } = {}) {
  n++;
  return prisma.user.create({
    data: {
      phone: `+9190000${String(n).padStart(5, "0")}${Math.floor(Math.random() * 10)}`,
      name: `User ${n}`,
      city: "Pune",
      payoutStatus: opts.payout === false ? "NONE" : "ACTIVE",
      payoutAccountId: opts.payout === false ? null : `mock_acc_${n}`,
    },
  });
}

async function listing(sellerId: string, pricePaise = 200000) {
  return prisma.listing.create({
    data: { sellerId, title: "Study table", description: "Wooden study table, good condition", category: "Furniture", condition: "GOOD", pricePaise, images: [], city: "Pune", area: "Kothrud", lat: 18.507, lng: 73.807 },
  });
}

async function pay(orderId: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const paymentId = `mock_pay_${o.providerOrderId}_${o.pricePaise}`;
  expect(mockProvider.verifyCheckoutSignature(o.providerOrderId!, paymentId, mockSignature(o.providerOrderId!, paymentId))).toBe(true);
  return confirmPayment(o.providerOrderId!, paymentId, "client");
}

async function paidOrder(opts: { sellerPayout?: boolean; price?: number } = {}) {
  const seller = await user({ payout: opts.sellerPayout });
  const buyer = await user();
  const l = await listing(seller.id, opts.price);
  const { order } = await reserve(buyer, l.id);
  await pay(order.id);
  return { seller, buyer, listing: l, orderId: order.id };
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "OrderEvent","Review","Message","Conversation","Order","Report","Listing","Session","User","RateLimit" CASCADE`);
});

describe("happy path", () => {
  it("reserve -> pay -> code -> seller paid minus 5% fee", async () => {
    const { seller, buyer, listing: l, orderId } = await paidOrder();

    let o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("PAID");
    expect(o.feePaise).toBe(10000);
    expect(o.sellerPayoutPaise).toBe(190000);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("RESERVED");

    // seller can't see code; buyer can
    await expect(revealCode(seller.id, orderId)).rejects.toThrow(/Only the buyer/);
    const code = await revealCode(buyer.id, orderId);
    expect(code).toMatch(/^\d{6}$/);
    expect(o.handoverCodeHash).not.toContain(code);

    // buyer can't complete their own handover
    await expect(completeWithCode(buyer.id, orderId, code)).rejects.toThrow(/Only the seller/);

    await completeWithCode(seller.id, orderId, code);
    o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("COMPLETED");
    expect(o.providerTransferId).toBeTruthy();
    expect(o.transferPaise).toBe(190000);
    expect(o.refundPaise).toBe(0);
    expect(o.settledAt).toBeTruthy();
    expect(o.handoverCodeEnc).toBeNull();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("SOLD");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).completedSales).toBe(1);

    // timeline was posted into the chat
    const msgs = await prisma.message.findMany({ where: { system: true } });
    expect(msgs.length).toBeGreaterThanOrEqual(2);
  });

  it("locks code entry after 5 wrong attempts", async () => {
    const { seller, buyer, orderId } = await paidOrder();
    const code = await revealCode(buyer.id, orderId);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await expect(completeWithCode(seller.id, orderId, wrong)).rejects.toThrow(/attempts left/);
    await expect(completeWithCode(seller.id, orderId, wrong)).rejects.toThrow(/locked/);
    await expect(completeWithCode(seller.id, orderId, code)).rejects.toThrow(/locked/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");
  });

  it("holds the payout until the seller sets up a bank account", async () => {
    const { seller, buyer, orderId } = await paidOrder({ sellerPayout: false });
    await completeWithCode(seller.id, orderId, await revealCode(buyer.id, orderId));
    let o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("COMPLETED");
    expect(o.settledAt).toBeNull();
    expect(o.settlementError).toBe("WAITING_FOR_SELLER_PAYOUT_SETUP");

    await prisma.user.update({ where: { id: seller.id }, data: { payoutStatus: "ACTIVE", payoutAccountId: "mock_acc_x" } });
    expect(await settle(orderId)).toEqual({ done: true });
    o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.providerTransferId).toBeTruthy();
  });
});

describe("concurrency", () => {
  it("only one of many simultaneous buyers can reserve", async () => {
    const seller = await user();
    const l = await listing(seller.id);
    const buyers = await Promise.all([user(), user(), user(), user(), user()]);
    const results = await Promise.allSettled(buyers.map((b) => reserve(b, l.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.count({ where: { listingId: l.id, status: "PENDING_PAYMENT" } })).toBe(1);
  });

  it("client callback and webhook racing confirm payment only once", async () => {
    const seller = await user();
    const buyer = await user();
    const l = await listing(seller.id);
    const { order } = await reserve(buyer, l.id);
    const paymentId = `mock_pay_${order.providerOrderId}_${order.pricePaise}`;
    await Promise.all([
      confirmPayment(order.providerOrderId!, paymentId, "client"),
      confirmPayment(order.providerOrderId!, paymentId, "webhook"),
      confirmPayment(order.providerOrderId!, paymentId, "webhook"),
    ]);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: "PAID" } })).toBe(1);
  });

  it("rejects a payment for the wrong amount", async () => {
    const seller = await user();
    const buyer = await user();
    const l = await listing(seller.id);
    const { order } = await reserve(buyer, l.id);
    await expect(confirmPayment(order.providerOrderId!, `mock_pay_${order.providerOrderId}_100`, "client")).rejects.toThrow(/amount/);
  });

  it("can't reserve your own item", async () => {
    const seller = await user();
    const l = await listing(seller.id);
    await expect(reserve(seller, l.id)).rejects.toThrow(/own item/);
  });
});

describe("unhappy paths", () => {
  it("buyer rejects after inspection -> full refund, item relisted", async () => {
    const { buyer, listing: l, orderId } = await paidOrder();
    await rejectItem(buyer.id, orderId, "Scratches not shown in photos");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("REJECTED");
    expect(o.refundPaise).toBe(200000);
    expect(o.providerRefundId).toBeTruthy();
    expect(o.providerTransferId).toBeNull();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("ACTIVE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).rejectionsAsBuyer).toBe(1);
  });

  it("seller backing out of a paid order -> refund + strike", async () => {
    const { seller, orderId } = await paidOrder();
    await cancelOrder(seller.id, orderId, "Changed my mind");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("CANCELLED");
    expect(o.providerRefundId).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).strikes).toBe(1);
  });

  it("buyer no-show, uncontested -> seller gets capped compensation, rest refunded", async () => {
    const { seller, buyer, orderId } = await paidOrder();
    await setMeetup(seller.id, orderId, "Kothrud metro station gate 1", new Date(Date.now() + 60_000));
    await expect(reportNoShow(seller.id, orderId)).rejects.toThrow(/15 minutes/);
    await prisma.order.update({ where: { id: orderId }, data: { meetupAt: new Date(Date.now() - 3600_000) } });
    await reportNoShow(seller.id, orderId);
    // contest window passes
    await prisma.order.update({ where: { id: orderId }, data: { noShowReportedAt: new Date(Date.now() - 25 * 3600_000) } });
    const stats = await runMaintenance();
    expect(stats.noShowsFinalized).toBe(1);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("BUYER_NO_SHOW");
    expect(o.compensationPaise).toBe(10000); // 5% of ₹2000 = ₹100, cap ₹100
    expect(o.refundPaise).toBe(190000);
    expect(o.providerRefundId && o.providerTransferId).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).noShowsAsBuyer).toBe(1);
  });

  it("contested no-show goes to admin, who can rule for the buyer", async () => {
    const { seller, buyer, orderId } = await paidOrder();
    await prisma.order.update({ where: { id: orderId }, data: { meetupAt: new Date(Date.now() - 3600_000) } });
    await reportNoShow(seller.id, orderId);
    await expect(contestNoShow(seller.id, orderId, "it was me who reported")).rejects.toThrow();
    await contestNoShow(buyer.id, orderId, "I was there, seller didn't come");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DISPUTED");
    const admin = await user();
    await resolveDispute(admin.id, orderId, "SELLER_NO_SHOW", "Buyer shared location photo");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("SELLER_NO_SHOW");
    expect(o.refundPaise).toBe(200000);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).strikes).toBe(1);
  });

  it("dispute resolved for seller pays seller", async () => {
    const { seller, buyer, orderId } = await paidOrder();
    await openDispute(seller.id, orderId, "Buyer took the item and left without giving the code");
    await expect(completeWithCode(seller.id, orderId, "123456")).rejects.toThrow(/not awaiting/);
    await resolveDispute(buyer.id, orderId, "PAY_SELLER", "");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("COMPLETED");
    expect(o.transferPaise).toBe(190000);
  });
});

describe("timeouts", () => {
  it("unpaid reservation expires and frees the item", async () => {
    const seller = await user();
    const buyer = await user();
    const l = await listing(seller.id);
    const { order } = await reserve(buyer, l.id);
    await prisma.order.update({ where: { id: order.id }, data: { paymentExpiresAt: new Date(Date.now() - 1000) } });
    expect((await runMaintenance()).expiredReservations).toBe(1);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("ACTIVE");

    // payment arriving after expiry is refunded in full
    await expect(confirmPayment(order.providerOrderId!, `mock_pay_${order.providerOrderId}_${order.pricePaise}`, "webhook")).rejects.toThrow(/refunded/);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("EXPIRED");
    expect(o.providerRefundId).toBeTruthy();
  });

  it("paid order with no handover by the deadline refunds the buyer", async () => {
    const { listing: l, orderId } = await paidOrder();
    await prisma.order.update({ where: { id: orderId }, data: { deadlineAt: new Date(Date.now() - 1000) } });
    expect((await runMaintenance()).expiredDeadlines).toBe(1);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("EXPIRED");
    expect(o.providerRefundId).toBeTruthy();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("ACTIVE");
  });
});
