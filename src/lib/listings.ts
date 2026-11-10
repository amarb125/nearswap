import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { boundingBox } from "./geo";

const PROHIBITED = [
  "gun", "pistol", "revolver", "rifle", "ammo", "ammunition", "bullet", "explosive", "firecracker", "knife set for fighting",
  "ganja", "weed", "marijuana", "charas", "cocaine", "mdma", "lsd", "drugs", "narcotic",
  "alcohol", "liquor", "whisky", "vodka", "beer", "cigarette", "vape", "tobacco",
  "prescription", "medicine", "injection", "steroid",
  "puppy", "kitten", "parrot", "live animal", "ivory", "tiger skin",
  "aadhaar", "pan card", "passport", "fake id", "fake currency", "counterfeit", "replica",
  "hacked account", "stolen",
];

export function prohibitedTerm(text: string): string | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ")} `;
  for (const w of PROHIBITED) if (t.includes(` ${w} `) || t.includes(` ${w}s `)) return w;
  return null;
}

export interface SearchParams {
  lat?: number;
  lng?: number;
  radiusKm: number;
  city?: string;
  q?: string;
  category?: string;
  sort: "nearest" | "newest" | "price_asc" | "price_desc";
  page: number;
  pageSize: number;
}

export async function searchListings(p: SearchParams) {
  const where: Prisma.Sql[] = [
    Prisma.sql`l.status = 'ACTIVE'::"ListingStatus"`,
    Prisma.sql`u."bannedAt" IS NULL`,
    Prisma.sql`u.strikes < 3`,
  ];
  const hasGeo = p.lat !== undefined && p.lng !== undefined;
  let distSql = Prisma.sql`NULL::float`;
  if (hasGeo) {
    const b = boundingBox(p.lat!, p.lng!, p.radiusKm);
    where.push(Prisma.sql`l.lat BETWEEN ${b.minLat} AND ${b.maxLat} AND l.lng BETWEEN ${b.minLng} AND ${b.maxLng}`);
    distSql = Prisma.sql`(12742 * asin(sqrt(
      power(sin(radians(l.lat - ${p.lat}) / 2), 2) +
      cos(radians(${p.lat})) * cos(radians(l.lat)) * power(sin(radians(l.lng - ${p.lng}) / 2), 2))))`;
  } else if (p.city) {
    where.push(Prisma.sql`lower(l.city) = lower(${p.city})`);
  }
  if (p.category) where.push(Prisma.sql`l.category = ${p.category}`);
  if (p.q) {
    const like = `%${p.q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    where.push(Prisma.sql`(l.title ILIKE ${like} OR l.description ILIKE ${like} OR l.area ILIKE ${like})`);
  }

  const order =
    p.sort === "newest" ? Prisma.sql`l."createdAt" DESC`
    : p.sort === "price_asc" ? Prisma.sql`l."pricePaise" ASC`
    : p.sort === "price_desc" ? Prisma.sql`l."pricePaise" DESC`
    : hasGeo ? Prisma.sql`dist ASC, l."createdAt" DESC`
    : Prisma.sql`l."createdAt" DESC`;

  const inner = Prisma.sql`
    SELECT l.id, ${distSql} AS dist, l."createdAt", l."pricePaise"
    FROM "Listing" l JOIN "User" u ON u.id = l."sellerId"
    WHERE ${Prisma.join(where, " AND ")}`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM (${inner}) l
    ${hasGeo ? Prisma.sql`WHERE dist <= ${p.radiusKm}` : Prisma.empty}
    ORDER BY ${order}
    LIMIT ${p.pageSize + 1} OFFSET ${(p.page - 1) * p.pageSize}`;

  const ids = rows.slice(0, p.pageSize).map((r) => r.id);
  const listings = await prisma.listing.findMany({ where: { id: { in: ids } }, include: { seller: true } });
  const byId = new Map(listings.map((l) => [l.id, l]));
  return { items: ids.map((id) => byId.get(id)!).filter(Boolean), hasMore: rows.length > p.pageSize };
}
