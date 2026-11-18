import "server-only";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { isHttpUrl, LIMITS, withHashtags, placeholders } from "@/lib/compose";
import { parseRule } from "@/lib/recur";
import { zonedToUtc } from "@/lib/time";
import { randomId } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { enqueue } from "./queue";
import { publishTarget, type PublishOutcome } from "./publish";

export const PostInput = z.object({
  text: z.string().trim().min(1, "Write the post text.").max(5000),
  linkUrl: z.string().trim().optional().default(""),
  linkTitle: z.string().trim().max(200).optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  accountIds: z.array(z.coerce.number().int().positive()).min(1, "Pick at least one account."),
  mode: z.enum(["now", "schedule", "draft"]),
  date: z.string().optional().default(""),
  time: z.string().optional().default(""),
  timezone: z.string().min(1).default("Europe/Malta"),
  rrule: z.string().optional().default(""),
  templateId: z.coerce.number().int().positive().optional(),
  hashtagSetId: z.coerce.number().int().positive().optional(),
  linkSetId: z.coerce.number().int().positive().optional(),
  allowDuplicate: z.boolean().optional().default(false),
});
export type PostInputT = z.infer<typeof PostInput>;

export type SaveResult = { ok: true; postId: number; status: string; outcomes?: PublishOutcome[]; message: string }
  | { ok: false; error: string; duplicate?: boolean };

export async function savePost(input: PostInputT, user: SessionUser): Promise<SaveResult> {
  const d = db();
  if (input.linkUrl && !isHttpUrl(input.linkUrl)) return { ok: false, error: "The link must start with https://" };
  if (input.imageUrl && !isHttpUrl(input.imageUrl)) return { ok: false, error: "The image link is not valid." };
  if (input.rrule && !parseRule(input.rrule)) return { ok: false, error: "The repeat rule is not valid." };
  const left = placeholders(input.text);
  if (left.length && input.mode !== "draft") return { ok: false, error: `Fill in the template fields first: ${left.map((x) => `{{${x}}}`).join(", ")}` };

  let text = input.text;
  if (input.hashtagSetId) {
    const [hs] = await d.select().from(schema.hashtagSets).where(eq(schema.hashtagSets.id, input.hashtagSetId));
    if (hs) text = withHashtags(text, hs.tags);
  }
  const accounts = await d.select().from(schema.socialAccounts).where(inArray(schema.socialAccounts.id, input.accountIds));
  if (accounts.length !== input.accountIds.length) return { ok: false, error: "One of the accounts no longer exists." };
  const off = accounts.filter((a) => a.status === "disconnected");
  if (off.length) return { ok: false, error: `${off.map((a) => a.name).join(", ")} is disconnected.` };
  for (const a of accounts) {
    const lim = LIMITS[a.platform] ?? 3000;
    if (text.length > lim) return { ok: false, error: `The text is ${text.length} characters; ${a.platform} allows ${lim}.` };
  }

  let when: Date | null = null;
  if (input.mode === "now") when = new Date();
  if (input.mode === "schedule") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: "Pick the date and time." };
    when = zonedToUtc(input.date, input.time, input.timezone);
    if (when.getTime() < Date.now() - 60_000) return { ok: false, error: "That time has already passed." };
  }

  // The same text on the same account within 24 hours is almost always a mistake (and LinkedIn refuses it).
  if (input.mode !== "draft" && !input.allowDuplicate) {
    const since = new Date(Date.now() - 864e5);
    const dup = await d.select({ name: schema.socialAccounts.name }).from(schema.postTargets)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postTargets.postId))
      .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.postTargets.accountId))
      .where(and(inArray(schema.postTargets.accountId, input.accountIds), eq(schema.posts.text, text),
        inArray(schema.postTargets.status, ["held", "scheduled", "publishing", "published"]), gt(schema.postTargets.scheduledAt, since))).limit(1);
    if (dup.length) return { ok: false, duplicate: true, error: `The same text is already posted or scheduled on ${dup[0].name} in the last 24 hours.` };
  }

  const s = await getSettings();
  const needsApproval = input.mode !== "draft" && s.approval_required && user.role === "editor";
  const status = input.mode === "draft" ? "draft" : needsApproval ? "needs_approval" : "scheduled";
  const [post] = await d.insert(schema.posts).values({
    text, linkUrl: input.linkUrl || null, linkTitle: input.linkTitle || null, imageUrl: input.imageUrl || null,
    templateId: input.templateId ?? null, hashtagSetId: input.hashtagSetId ?? null, linkSetId: input.linkSetId ?? null,
    scheduledAt: when, timezone: input.timezone, rrule: input.rrule || null, status, createdBy: user.id,
    approvedBy: status === "scheduled" ? user.id : null, approvedAt: status === "scheduled" ? new Date() : null,
  }).returning();

  if (input.mode === "draft") {
    await audit(user.id, "post.draft", `#${post.id}`);
    return { ok: true, postId: post.id, status, message: "Saved as a draft." };
  }
  const targets = await d.insert(schema.postTargets).values(input.accountIds.map((accountId) => ({
    postId: post.id, accountId, scheduledAt: when!, linkCode: randomId(6), status: needsApproval ? ("held" as const) : ("scheduled" as const),
  }))).returning({ id: schema.postTargets.id });
  await audit(user.id, `post.${status}`, `#${post.id} on ${accounts.map((a) => a.name).join(", ")}`);

  if (needsApproval) return { ok: true, postId: post.id, status, message: "Sent for approval. An admin approves it on the Approvals page." };
  if (input.mode === "now") {
    const outcomes = await Promise.all(targets.map((t) => publishTarget(t.id)));
    const okN = outcomes.filter((o) => o.status === "published").length;
    return { ok: true, postId: post.id, status, outcomes,
      message: okN === outcomes.length ? "Published." : `${okN} of ${outcomes.length} published: ${outcomes.filter((o) => o.message).map((o) => o.message).join(" ")}` };
  }
  await Promise.all(targets.map((t) => enqueue(t.id, when!)));
  return { ok: true, postId: post.id, status, message: "Scheduled." };
}

/** Approve (or reject) a post waiting for approval. */
export async function decide(postId: number, approve: boolean, user: SessionUser) {
  const d = db();
  const [post] = await d.update(schema.posts).set(approve
    ? { status: "scheduled", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() }
    : { status: "cancelled", updatedAt: new Date() })
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.status, "needs_approval"))).returning();
  if (!post) return "This post is no longer waiting for approval.";
  if (!approve) {
    await d.update(schema.postTargets).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.postTargets.postId, postId));
    await audit(user.id, "post.rejected", `#${postId}`);
    return "Rejected.";
  }
  const at = post.scheduledAt && post.scheduledAt.getTime() > Date.now() ? post.scheduledAt : new Date();
  const ts = await d.update(schema.postTargets).set({ status: "scheduled", scheduledAt: at, updatedAt: new Date() })
    .where(and(eq(schema.postTargets.postId, postId), eq(schema.postTargets.status, "held"))).returning({ id: schema.postTargets.id });
  await audit(user.id, "post.approved", `#${postId}`);
  if (at.getTime() <= Date.now() + 60_000) { await Promise.all(ts.map((t) => publishTarget(t.id))); return "Approved and published."; }
  await Promise.all(ts.map((t) => enqueue(t.id, at)));
  return "Approved; it goes out at the scheduled time.";
}

/** Cancel the parts not yet published. Stops a repeating series too. */
export async function cancelPost(postId: number, user: SessionUser) {
  const d = db();
  await d.update(schema.postTargets).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(schema.postTargets.postId, postId), inArray(schema.postTargets.status, ["held", "scheduled"])));
  await d.update(schema.posts).set({ status: "cancelled", rrule: null, updatedAt: new Date() })
    .where(and(eq(schema.posts.id, postId), inArray(schema.posts.status, ["draft", "needs_approval", "scheduled"])));
  await audit(user.id, "post.cancelled", `#${postId}`);
}

/** Calendar drag: move a scheduled post (only the parts not yet published). */
export async function reschedule(postId: number, at: Date, user: SessionUser) {
  if (at.getTime() < Date.now() - 60_000) return "That time has already passed.";
  const d = db();
  const [p] = await d.update(schema.posts).set({ scheduledAt: at, updatedAt: new Date() })
    .where(and(eq(schema.posts.id, postId), inArray(schema.posts.status, ["needs_approval", "scheduled"]))).returning();
  if (!p) return "Only scheduled posts can be moved.";
  const ts = await d.update(schema.postTargets).set({ scheduledAt: at, updatedAt: new Date() })
    .where(and(eq(schema.postTargets.postId, postId), inArray(schema.postTargets.status, ["held", "scheduled"]))).returning();
  await Promise.all(ts.filter((t) => t.status === "scheduled").map((t) => enqueue(t.id, at)));
  await audit(user.id, "post.moved", `#${postId} to ${at.toISOString()}`);
  return "Moved.";
}

export async function countByStatus() {
  return db().select({ status: schema.posts.status, n: sql<number>`count(*)::int` }).from(schema.posts).groupBy(schema.posts.status);
}
