import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads DATABASE_URL from schema.prisma or loads .env by itself.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
