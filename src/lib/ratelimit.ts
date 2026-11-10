import { prisma } from "./db";
import { HttpError } from "./http";

/** Fixed-window rate limiter backed by Postgres (works across multiple app instances). */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  if (rows[0].count > limit) throw new HttpError(429, "Too many requests. Please wait and try again.");
}
