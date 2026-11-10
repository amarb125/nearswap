import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { HttpError } from "./http";
import { config } from "./config";

export const SESSION_COOKIE = "ns_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<string> {
  const token = randomToken(32);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

async function tokenFromRequest(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<User | null> {
  const token = await tokenFromRequest();
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.bannedAt) return null;
  return session.user;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Please log in", "UNAUTHENTICATED");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new HttpError(403, "Admins only");
  return u;
}

/** Normalize Indian / international numbers to E.164. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const d = digits.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return "+91" + d;
  if (/^0[6-9]\d{9}$/.test(d)) return "+91" + d.slice(1);
  if (/^91[6-9]\d{9}$/.test(d)) return "+" + d;
  return null;
}
