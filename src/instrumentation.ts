import type { Instrumentation } from "next";

// Runs once when the server boots: start error tracking, then refuse to start with an
// unsafe/incomplete production config.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initMonitoring, captureError, flushMonitoring } = await import("./lib/monitoring");
    initMonitoring();
    const { config } = await import("./lib/config");
    try {
      config();
    } catch (e) {
      console.error("[startup] Refusing to start:", e instanceof Error ? e.message : e);
      captureError(e, { phase: "startup" });
      await flushMonitoring();
      // Next would otherwise keep the process alive but unable to serve anything, so container
      // restart policies and health checks never notice. Exit so the failure is visible.
      process.exit(1);
    }
  }
}

// Errors that escape route handlers and server components (e.g. a failing /api/cron run).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureError } = await import("./lib/monitoring");
  captureError(err, { method: request.method, path: request.path.split("?")[0], route: context.routePath });
};
