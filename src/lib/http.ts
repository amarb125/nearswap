import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler: CSRF origin check for mutations, uniform error responses.
 */
export function route<C = unknown>(fn: Handler<C>, opts: { skipOriginCheck?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (!opts.skipOriginCheck && !["GET", "HEAD", "OPTIONS"].includes(req.method)) checkOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      if (typeof e === "object" && e && (e as { code?: string }).code === "P2002")
        return NextResponse.json({ error: "This has already been done" }, { status: 409 });
      if (e instanceof ZodError)
        return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid input", issues: e.issues }, { status: 400 });
      console.error("[api error]", req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (mobile apps, curl) don't send Origin; cookies are SameSite=Lax so
    // cross-site form posts can't ride the session anyway. Block if Sec-Fetch-Site says cross-site.
    if (req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site request blocked");
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Bad origin");
  }
}

export async function body<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  return schema.parse(json);
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
