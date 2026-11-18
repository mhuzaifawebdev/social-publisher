import { defineConfig } from "drizzle-kit";

// Local runs read .env.local (never committed).
try { process.loadEnvFile(".env.local"); } catch { /* not present on CI */ }

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
