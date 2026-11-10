import { createHmac, randomBytes, randomInt, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import { config } from "./config";

export function hmac(value: string, purpose: string): string {
  return createHmac("sha256", config().APP_SECRET).update(`${purpose}:${value}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += randomInt(0, 10).toString();
  return s;
}

function key(): Buffer {
  return createHash("sha256").update("enc-key:" + config().APP_SECRET).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(token: string): string {
  const [iv, tag, enc] = token.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
