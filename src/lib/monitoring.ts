import * as Sentry from "@sentry/node";

let started = false;

/** Starts Sentry if SENTRY_DSN is set. Safe to call more than once; a no-op otherwise. */
export function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (started || !dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Errors only: no performance tracing, and never attach request bodies/cookies/IPs.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  started = true;
}

/** Report an unexpected error. Does nothing when Sentry isn't configured. */
export function captureError(error: unknown, context?: Record<string, string | undefined>) {
  if (!started) return;
  Sentry.captureException(error, context ? { tags: context } : undefined);
}

/** Give Sentry a moment to send queued events, e.g. before the process exits. */
export async function flushMonitoring(timeoutMs = 2000) {
  if (started) await Sentry.flush(timeoutMs);
}
