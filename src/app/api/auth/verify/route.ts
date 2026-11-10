import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, clientIp, HttpError, ok, route } from "@/lib/http";
import { createSession, normalizePhone } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { hmac, safeEqualHex } from "@/lib/crypto";
import { adminPhones } from "@/lib/config";

export const POST = route(async (req) => {
  const input = await body(req, z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }));
  const phone = normalizePhone(input.phone);
  if (!phone) throw new HttpError(400, "Enter a valid mobile number");
  await rateLimit(`verify:ip:${clientIp(req)}`, 30, 3600);

  const otp = await prisma.otpCode.findFirst({ where: { phone, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt < new Date()) throw new HttpError(400, "Code expired. Request a new one.");
  if (otp.attempts >= 5) throw new HttpError(429, "Too many attempts. Request a new code.");
  if (!safeEqualHex(hmac(`${phone}:${input.code}`, "otp"), otp.codeHash)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, "Incorrect code");
  }
  const consumed = await prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new HttpError(400, "Code already used");

  const isAdmin = adminPhones().has(phone);
  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, role: isAdmin ? "ADMIN" : "USER" },
    update: isAdmin ? { role: "ADMIN" } : {},
  });
  if (user.bannedAt) throw new HttpError(403, "This account has been suspended. Contact support.");
  await createSession(user.id);
  return ok({ user: { id: user.id, name: user.name, needsProfile: !user.name } });
});
