"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body || init?.form ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.form ?? (init?.body ? JSON.stringify(init.body) : undefined),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiError(res.status, json.error ?? "Something went wrong", json.code);
  }
  return json as T;
}

export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
}

export function timeAgo(d: string | Date) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | Date) {
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export interface PublicUser {
  id: string;
  name: string;
  city: string | null;
  idVerified: boolean;
  rating: number | null;
  ratingCount: number;
  completedSales: number;
  completedBuys: number;
  noShows: number;
  memberSince: string;
  payoutReady: boolean;
}

export interface Me extends PublicUser {
  phoneLast4: string;
  role: "USER" | "ADMIN";
  payoutStatus: "NONE" | "PENDING" | "ACTIVE" | "FAILED";
  payoutAccountLast4: string | null;
  strikes: number;
  activeOrders: number;
}

export interface ListingCard {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  pricePaise: number;
  images: string[];
  city: string;
  area: string;
  status: string;
  distanceKm?: number;
  createdAt: string;
  seller?: PublicUser;
}

export interface OrderView {
  id: string;
  role: "buyer" | "seller";
  status: string;
  listingId: string;
  pricePaise: number;
  feePaise?: number;
  sellerPayoutPaise?: number;
  refundPaise: number;
  transferPaise?: number;
  compensationPaise: number;
  meetupPlace: string | null;
  meetupAt: string | null;
  paymentExpiresAt: string;
  deadlineAt: string | null;
  noShowReportedBy: "BUYER" | "SELLER" | null;
  noShowReportedAt: string | null;
  codeLockedUntil: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  disputeReason: string | null;
  adminNote: string | null;
  settled: boolean;
  payoutWaitingForSetup: boolean;
  paidAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "red" | "stone" | "blue" }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "amber" },
  PAID: { label: "Paid · meetup pending", tone: "blue" },
  COMPLETED: { label: "Completed", tone: "green" },
  REJECTED: { label: "Rejected · refunded", tone: "stone" },
  CANCELLED: { label: "Cancelled", tone: "stone" },
  BUYER_NO_SHOW: { label: "Buyer no-show", tone: "red" },
  SELLER_NO_SHOW: { label: "Seller no-show", tone: "red" },
  EXPIRED: { label: "Expired", tone: "stone" },
  DISPUTED: { label: "Under review", tone: "amber" },
};
