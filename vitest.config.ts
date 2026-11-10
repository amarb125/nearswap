import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: "./tests/global-setup.ts",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://nearswap:nearswap@localhost:5432/nearswap_test",
      APP_SECRET: "test-secret-test-secret-test-secret-1234",
      CRON_SECRET: "test-cron-secret-123",
      PAYMENT_PROVIDER: "mock",
      SMS_PROVIDER: "console",
    },
  },
});
