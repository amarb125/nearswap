import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, clientIp, HttpError, ok, route } from "@/lib/http";
import { normalizePhone } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { hmac, randomDigits } from "@/lib/crypto";
import { sendOtpSms } from "@/lib/sms";
import { config } from "@/lib/config";

export const POST = route(async (req) => {
  const { phone: raw } = await body(req, z.object({ phone: z.string().min(8).max(20) }));
  const phone = normalizePhone(raw);
  if (!phone) throw new HttpError(400, "Enter a valid mobile number");
  await rateLimit(`otp:ip:${clientIp(req)}`, 10, 3600);
  await rateLimit(`otp:phone:${phone}`, 3, 600);

  const code = randomDigits(6);
  await prisma.otpCode.create({ data: { phone, codeHash: hmac(`${phone}:${code}`, "otp"), expiresAt: new Date(Date.now() + 5 * 60_000) } });
  await sendOtpSms(phone, code);
  return ok({ sent: true, phone, devCode: config().SMS_PROVIDER === "console" && config().NODE_ENV !== "production" ? code : undefined });
});
