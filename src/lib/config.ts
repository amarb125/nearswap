import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("Nearswap"),
  // 32+ char secret used for HMAC (OTP/handover code hashing) and AES key derivation
  APP_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16).optional(),
  // /api/health/cron reports unhealthy if /api/cron hasn't succeeded within this many minutes
  CRON_STALE_MINUTES: z.coerce.number().int().min(1).default(15),
  // Optional: Sentry DSN for server-side error tracking (disabled when empty)
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),

  // Commission: basis points (500 = 5%), min and max in paise
  FEE_BPS: z.coerce.number().int().min(0).max(5000).default(500),
  FEE_MIN_PAISE: z.coerce.number().int().min(0).default(1000),
  FEE_MAX_PAISE: z.coerce.number().int().min(0).default(50000),
  // Buyer no-show compensation to seller: bps of price, capped
  NOSHOW_COMP_BPS: z.coerce.number().int().min(0).max(5000).default(500),
  NOSHOW_COMP_MAX_PAISE: z.coerce.number().int().min(0).default(10000),
  PAYMENT_WINDOW_MINUTES: z.coerce.number().int().min(5).default(30),
  MEETUP_DEADLINE_HOURS: z.coerce.number().int().min(1).default(72),
  NOSHOW_CONTEST_HOURS: z.coerce.number().int().min(1).default(24),
  MAX_PRICE_PAISE: z.coerce.number().int().default(20_000_000), // ₹2,00,000

  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  SMS_PROVIDER: z.enum(["console", "twilio", "msg91"]).default("console"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  LOCAL_UPLOAD_DIR: z.string().default("./uploads"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(), // e.g. CDN base URL

  ADMIN_PHONES: z.string().default(""), // comma-separated E.164 numbers auto-promoted to ADMIN
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid environment configuration: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const c = parsed.data;
  if (c.NODE_ENV === "production") {
    const problems: string[] = [];
    if (c.PAYMENT_PROVIDER === "mock") problems.push("PAYMENT_PROVIDER=mock is not allowed in production");
    if (c.SMS_PROVIDER === "console") problems.push("SMS_PROVIDER=console is not allowed in production");
    if (c.PAYMENT_PROVIDER === "razorpay" && (!c.RAZORPAY_KEY_ID || !c.RAZORPAY_KEY_SECRET || !c.RAZORPAY_WEBHOOK_SECRET))
      problems.push("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required");
    if (!c.CRON_SECRET) problems.push("CRON_SECRET is required");
    if (problems.length && process.env.ALLOW_INSECURE_PROD !== "1") throw new Error(problems.join("; "));
  }
  cached = c;
  return c;
}

export function adminPhones(): Set<string> {
  return new Set(config().ADMIN_PHONES.split(",").map((s) => s.trim()).filter(Boolean));
}
