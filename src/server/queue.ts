import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl, envOr } from "@/lib/env";

/**
 * Exact-time publishing through Upstash QStash: one message per target, delivered to /api/publish at the scheduled
 * minute. Without QStash keys (local runs) the 10-minute sweep publishes due targets instead, so nothing is lost.
 */
export function queueOn() { return !!envOr("QSTASH_TOKEN"); }

export async function enqueue(targetId: number, at: Date): Promise<void> {
  if (!queueOn()) return;
  try {
    const c = new Client({ token: envOr("QSTASH_TOKEN") });
    const notBefore = Math.max(Math.floor(at.getTime() / 1000), Math.floor(Date.now() / 1000));
    const r = await c.publishJSON({
      url: `${appUrl()}/api/publish`, body: { targetId }, notBefore, retries: 2,
      deduplicationId: `t${targetId}-${notBefore}`,
    });
    await db().update(schema.postTargets).set({ qstashId: r.messageId }).where(eq(schema.postTargets.id, targetId));
  } catch {
    // The sweep picks the target up; a queue hiccup never blocks saving a post.
  }
}

export async function verifyQstash(signature: string | null, body: string): Promise<boolean> {
  if (!signature) return false;
  try {
    const r = new Receiver({ currentSigningKey: envOr("QSTASH_CURRENT_SIGNING_KEY"), nextSigningKey: envOr("QSTASH_NEXT_SIGNING_KEY") });
    return await r.verify({ signature, body });
  } catch { return false; }
}
