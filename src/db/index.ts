import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// HTTP driver: one fetch per query, no connection pool to warm up (fast on Vercel serverless).
// Atomic steps use single UPDATE … WHERE … RETURNING statements, so no interactive transactions are needed.
type DB = ReturnType<typeof make>;
let _db: DB | null = null;
function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return drizzle(neon(url), { schema });
}
export function db(): DB { return (_db ??= make()); }

/** Tests only: run the same code against an in-memory Postgres (PGlite). */
export function useDbForTests(d: unknown) { _db = d as DB; }
export { schema };
