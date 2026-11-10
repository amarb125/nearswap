// Runs once when the server boots: refuse to start with an unsafe/incomplete production config.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { config } = await import("./lib/config");
    config();
  }
}
