// Runs once when the server boots: refuse to start with an unsafe/incomplete production config.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { config } = await import("./lib/config");
    try {
      config();
    } catch (e) {
      console.error("[startup] Refusing to start:", e instanceof Error ? e.message : e);
      // Next would otherwise keep the process alive but unable to serve anything, so container
      // restart policies and health checks never notice. Exit so the failure is visible.
      process.exit(1);
    }
  }
}
