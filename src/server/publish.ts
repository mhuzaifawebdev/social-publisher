import "server-only";
import { and, eq, inArray, lte, or, lt, sql, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "@/lib/env";
import { withUtm } from "@/lib/compose";
import { nextOccurrence } from "@/lib/recur";
import { randomId } from "@/lib/crypto";
import { platform, PlatformError } from "@/platforms";
import { accountToken, markAccount, ref } from "./accounts";
import { enqueue } from "./queue";

const MAX_ATTEMPTS = 3;
const STUCK_MS = 10 * 60_000;

export type PublishOutcome = { targetId: number; status: "published" | "failed" | "retry" | "skipped"; message?: string; url?: string | null };

/** The link a post shows: our click counter (/r/<code>) when the link set tracks clicks, else the UTM-tagged link. */
export function targetLink(post: { linkUrl: string | null }, target: { linkCode: string | null }, track: boolean): string | null {
  if (!post.linkUrl) return null;
  return track && target.linkCode ? `${appUrl()}/r/${target.linkCode}` : post.linkUrl;
}

/**
 * Publishes one target (one post on one account). Safe to call many times at once: the first caller locks the row
 * with a single atomic UPDATE (scheduled -> publishing), so a post can never go out twice. A row stuck in
 * "publishing" for 10 minutes (the function was killed) is NOT re-sent blindly: it is marked failed for a person to
 * check, because LinkedIn may already have published it.
 */
export async function publishTarget(targetId: number): Promise<PublishOutcome> {
  const d = db();
  const now = new Date();
  const [t] = await d.update(schema.postTargets)
    .set({ status: "publishing", lockedAt: now, attempts: sql`${schema.postTargets.attempts} + 1`, updatedAt: now })
    .where(and(eq(schema.postTargets.id, targetId), eq(schema.postTargets.status, "scheduled"),
      lte(schema.postTargets.scheduledAt, new Date(now.getTime() + 60_000))))
    .returning();
  if (!t) return { targetId, status: "skipped" };

  const [post] = await d.select().from(schema.posts).where(eq(schema.posts.id, t.postId));
  const [acc] = await d.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, t.accountId));
  let track = true;
  if (post?.linkSetId) {
    const [ls] = await d.select({ track: schema.linkSets.track }).from(schema.linkSets).where(eq(schema.linkSets.id, post.linkSetId));
    track = ls?.track ?? true;
  }

  try {
    if (!post || !acc) throw new PlatformError("The post or the account was deleted.", false);
    if (acc.status === "disconnected") throw new PlatformError(`${acc.name} is disconnected.`, false, true);
    const p = platform(acc.platform);
    const token = await accountToken(acc);
    let mediaId: string | null = null;
    if (post.imageUrl) {
      const img = await fetch(post.imageUrl);
      if (!img.ok) throw new PlatformError(`The image could not be read (${img.status}).`, img.status >= 500);
      mediaId = await p.uploadImage(ref(acc), token, new Uint8Array(await img.arrayBuffer()), img.headers.get("content-type") || "image/png");
    }
    const r = await p.publish(ref(acc), token, { text: post.text, link: targetLink(post, t, track), linkTitle: post.linkTitle, mediaId });
    await d.update(schema.postTargets).set({ status: "published", externalId: r.externalId, url: r.url, error: null,
      publishedAt: new Date(), updatedAt: new Date() }).where(eq(schema.postTargets.id, t.id));
    if (acc.status !== "active") await markAccount(acc.id, "active", null);
    await afterTarget(t.postId);
    return { targetId, status: "published", url: r.url };
  } catch (e) {
    const err = e instanceof PlatformError ? e : new PlatformError(String((e as Error)?.message || e).slice(0, 300), true);
    if (err.auth && acc) await markAccount(acc.id, "expired", err.message);
    if (err.retry && t.attempts < MAX_ATTEMPTS) {
      const at = new Date(Date.now() + 5 * 60_000 * t.attempts);       // 5, 10 minutes
      await d.update(schema.postTargets).set({ status: "scheduled", scheduledAt: at, error: err.message, lockedAt: null, updatedAt: new Date() })
        .where(eq(schema.postTargets.id, t.id));
      await enqueue(t.id, at);
      return { targetId, status: "retry", message: err.message };
    }
    await d.update(schema.postTargets).set({ status: "failed", error: err.message, updatedAt: new Date() }).where(eq(schema.postTargets.id, t.id));
    await afterTarget(t.postId);
    return { targetId, status: "failed", message: err.message };
  }
}

/** Rows killed half-way (function timeout) are marked failed with a clear note, never re-sent by themselves. */
export async function releaseStuck() {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const rows = await db().update(schema.postTargets)
    .set({ status: "failed", error: "Stopped half-way: check on LinkedIn whether it was posted, then use Retry if not.", updatedAt: new Date() })
    .where(and(eq(schema.postTargets.status, "publishing"), or(lt(schema.postTargets.lockedAt, cutoff), isNull(schema.postTargets.lockedAt))))
    .returning({ postId: schema.postTargets.postId });
  for (const postId of new Set(rows.map((r) => r.postId))) await afterTarget(postId);
  return rows.length;
}

/** The post's status from its targets, and the next post of a repeating series once this one is done. */
export async function afterTarget(postId: number) {
  const d = db();
  const ts = await d.select({ status: schema.postTargets.status }).from(schema.postTargets).where(eq(schema.postTargets.postId, postId));
  const n = (s: string) => ts.filter((x) => x.status === s).length;
  const open = n("scheduled") + n("publishing") + n("held");
  if (open) return;
  const status = n("published") === ts.length ? "published" : n("published") ? "partly_published" : n("cancelled") === ts.length ? "cancelled" : "failed";
  const [post] = await d.update(schema.posts).set({ status, updatedAt: new Date() })
    .where(and(eq(schema.posts.id, postId), inArray(schema.posts.status, ["scheduled", "publishing"]))).returning();
  if (post?.rrule && post.scheduledAt && status !== "cancelled") await scheduleNextInSeries(post);
}

async function scheduleNextInSeries(post: typeof schema.posts.$inferSelect) {
  const d = db();
  const seriesId = post.seriesId ?? post.id;
  const [{ done }] = await d.select({ done: sql<number>`count(*)::int` }).from(schema.posts)
    .where(or(eq(schema.posts.id, seriesId), eq(schema.posts.seriesId, seriesId)));
  let next = nextOccurrence(post.rrule!, post.scheduledAt!, post.timezone, done);
  while (next && next.getTime() < Date.now()) next = nextOccurrence(post.rrule!, next, post.timezone, done); // skip missed ones
  if (!next) return;
  const [exists] = await d.select({ id: schema.posts.id }).from(schema.posts)
    .where(and(eq(schema.posts.seriesId, seriesId), eq(schema.posts.scheduledAt, next))).limit(1);
  if (exists) return;
  const targets = await d.select({ accountId: schema.postTargets.accountId }).from(schema.postTargets).where(eq(schema.postTargets.postId, post.id));
  const [np] = await d.insert(schema.posts).values({
    text: post.text, linkUrl: post.linkUrl, linkTitle: post.linkTitle, imageUrl: post.imageUrl, templateId: post.templateId,
    hashtagSetId: post.hashtagSetId, linkSetId: post.linkSetId, scheduledAt: next, timezone: post.timezone, rrule: post.rrule,
    seriesId, status: "scheduled", createdBy: post.createdBy, approvedBy: post.approvedBy, approvedAt: post.approvedAt,
  }).returning();
  const rows = await d.insert(schema.postTargets).values(targets.map((t) => ({
    postId: np.id, accountId: t.accountId, scheduledAt: next!, linkCode: randomId(6), status: "scheduled" as const,
  }))).returning({ id: schema.postTargets.id });
  for (const r of rows) await enqueue(r.id, next);
}

/** Retry button: a failed target goes back to the queue now. */
export async function retryTarget(targetId: number) {
  const d = db();
  const [t] = await d.update(schema.postTargets).set({ status: "scheduled", scheduledAt: new Date(), attempts: 0, error: null, lockedAt: null, updatedAt: new Date() })
    .where(and(eq(schema.postTargets.id, targetId), eq(schema.postTargets.status, "failed"))).returning();
  if (!t) return null;
  await d.update(schema.posts).set({ status: "scheduled", updatedAt: new Date() }).where(eq(schema.posts.id, t.postId));
  return publishTarget(t.id);
}

/** Withs the link-code utm: used by the /r/<code> redirect. */
export async function resolveLink(code: string): Promise<{ targetId: number; url: string } | null> {
  const d = db();
  const [row] = await d.select({ targetId: schema.postTargets.id, linkUrl: schema.posts.linkUrl, linkSetId: schema.posts.linkSetId,
    accountName: schema.socialAccounts.name, postId: schema.posts.id })
    .from(schema.postTargets)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.postTargets.postId))
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.postTargets.accountId))
    .where(eq(schema.postTargets.linkCode, code)).limit(1);
  if (!row?.linkUrl) return null;
  let utm = { source: "linkedin", medium: "social", campaign: "" };
  if (row.linkSetId) {
    const [ls] = await d.select().from(schema.linkSets).where(eq(schema.linkSets.id, row.linkSetId));
    if (ls) utm = { source: ls.utmSource, medium: ls.utmMedium, campaign: ls.utmCampaign };
  }
  return { targetId: row.targetId, url: withUtm(row.linkUrl, { ...utm, content: `post${row.postId}-${row.accountName.toLowerCase().replace(/\W+/g, "-")}` }) };
}
