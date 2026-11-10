import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { randomToken } from "./crypto";
import { HttpError } from "./http";

const MAX_BYTES = 5 * 1024 * 1024;

export function detectImageType(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length > 12 && Buffer.from(buf.slice(0, 4)).toString() === "RIFF" && Buffer.from(buf.slice(8, 12)).toString() === "WEBP") return "image/webp";
  return null;
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export const KEY_RE = /^img\/[A-Za-z0-9_-]{20,}\.(jpg|png|webp)$/;

export async function storeImage(buf: Uint8Array): Promise<string> {
  if (buf.length > MAX_BYTES) throw new HttpError(413, "Images must be under 5 MB");
  const type = detectImageType(buf);
  if (!type) throw new HttpError(415, "Only JPEG, PNG or WebP images are allowed");
  const key = `img/${randomToken(18)}.${EXT[type]}`;
  const c = config();
  if (c.STORAGE_PROVIDER === "s3") {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: c.S3_REGION ?? "auto",
      endpoint: c.S3_ENDPOINT,
      credentials: c.S3_ACCESS_KEY_ID ? { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY ?? "" } : undefined,
    });
    await s3.send(new PutObjectCommand({ Bucket: c.S3_BUCKET, Key: key, Body: buf, ContentType: type, CacheControl: "public, max-age=31536000, immutable" }));
  } else {
    const file = path.join(c.LOCAL_UPLOAD_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buf);
  }
  return key;
}

export async function readLocalImage(key: string): Promise<{ data: Buffer; type: string } | null> {
  if (!KEY_RE.test(key)) return null;
  try {
    const data = await readFile(path.join(config().LOCAL_UPLOAD_DIR, key));
    return { data, type: detectImageType(data) ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export function imageUrl(key: string): string {
  const c = config();
  if (c.STORAGE_PROVIDER === "s3" && c.S3_PUBLIC_URL) return `${c.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return `/api/files/${key}`;
}
