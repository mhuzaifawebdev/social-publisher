import { db, schema } from "@/db";
export async function audit(userId: number | null, action: string, detail = "") {
  try { await db().insert(schema.auditLog).values({ userId, action, detail: detail.slice(0, 1000) }); } catch { /* never block */ }
}
