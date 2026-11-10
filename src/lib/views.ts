import type { Listing, User } from "@prisma/client";
import { imageUrl } from "./storage";
import { haversineKm } from "./geo";

/** What other users may see about a person. Never includes phone number. */
export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name ?? "Neighbour",
    city: u.city,
    idVerified: u.idVerified,
    rating: u.ratingCount ? Math.round((u.ratingSum / u.ratingCount) * 10) / 10 : null,
    ratingCount: u.ratingCount,
    completedSales: u.completedSales,
    completedBuys: u.completedBuys,
    noShows: u.noShowsAsSeller + u.noShowsAsBuyer,
    memberSince: u.createdAt,
    payoutReady: u.payoutStatus === "ACTIVE",
  };
}

export function listingView(l: Listing & { seller?: User }, from?: { lat: number; lng: number }) {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    category: l.category,
    condition: l.condition,
    pricePaise: l.pricePaise,
    images: l.images.map(imageUrl),
    city: l.city,
    area: l.area,
    status: l.status,
    distanceKm: from ? Math.round(haversineKm(from.lat, from.lng, l.lat, l.lng) * 10) / 10 : undefined,
    createdAt: l.createdAt,
    seller: l.seller ? publicUser(l.seller) : undefined,
  };
}

export const CATEGORIES = [
  "Electronics",
  "Mobiles",
  "Furniture",
  "Home & Kitchen",
  "Books",
  "Fashion",
  "Sports & Fitness",
  "Kids & Baby",
  "Vehicles & Parts",
  "Musical Instruments",
  "Tools",
  "Other",
] as const;

export const CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"] as const;
export const CONDITION_LABEL: Record<(typeof CONDITIONS)[number], string> = {
  NEW: "New (unused)",
  LIKE_NEW: "Like new",
  GOOD: "Good",
  FAIR: "Fair (visible wear)",
  FOR_PARTS: "For parts / not working",
};
