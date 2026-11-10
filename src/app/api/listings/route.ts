import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { coarsen, isValidLatLng } from "@/lib/geo";
import { prohibitedTerm, searchListings } from "@/lib/listings";
import { CATEGORIES, CONDITIONS, listingView } from "@/lib/views";
import { KEY_RE } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";
import { config } from "@/lib/config";

const num = z.coerce.number().optional();
const searchSchema = z.object({
  lat: num,
  lng: num,
  radiusKm: z.coerce.number().min(1).max(50).default(10),
  city: z.string().max(60).optional(),
  q: z.string().max(80).optional(),
  category: z.enum(CATEGORIES).optional(),
  sort: z.enum(["nearest", "newest", "price_asc", "price_desc"]).default("nearest"),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

export const GET = route(async (req) => {
  const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const p = searchSchema.parse(params);
  if ((p.lat === undefined) !== (p.lng === undefined) || (p.lat !== undefined && !isValidLatLng(p.lat, p.lng!)))
    throw new HttpError(400, "Invalid location");
  const { items, hasMore } = await searchListings({ ...p, q: p.q?.trim() || undefined, pageSize: 24 });
  const from = p.lat !== undefined ? { lat: p.lat, lng: p.lng! } : undefined;
  return ok({ items: items.map((l) => listingView(l, from)), hasMore, page: p.page });
});

const createSchema = z.object({
  title: z.string().trim().min(4).max(80),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(CATEGORIES),
  condition: z.enum(CONDITIONS),
  pricePaise: z.number().int().min(1000, "Minimum price is ₹10"),
  images: z.array(z.string().regex(KEY_RE)).min(1, "Add at least one photo").max(8),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().min(2).max(80),
  lat: z.number(),
  lng: z.number(),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  if (!u.name || !u.city) throw new HttpError(400, "Complete your profile first", "PROFILE_INCOMPLETE");
  if (u.strikes >= 3) throw new HttpError(403, "Your account can't create listings because of repeated no-shows/cancellations.");
  await rateLimit(`listing:create:${u.id}`, 20, 86400);
  const input = await body(req, createSchema);
  if (input.pricePaise > config().MAX_PRICE_PAISE) throw new HttpError(400, "Price is above the maximum allowed");
  if (!isValidLatLng(input.lat, input.lng)) throw new HttpError(400, "Invalid location");
  const bad = prohibitedTerm(`${input.title} ${input.description}`);
  if (bad) throw new HttpError(400, `Items like "${bad}" can't be sold on this platform. See our prohibited items policy.`);

  const listing = await prisma.listing.create({
    data: { ...input, lat: coarsen(input.lat), lng: coarsen(input.lng), sellerId: u.id },
  });
  return ok({ id: listing.id }, { status: 201 });
});

export const dynamic = "force-dynamic";
