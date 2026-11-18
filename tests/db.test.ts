/**
 * Integration tests against an in-memory Postgres (PGlite) with the real migration, the real server code and a fake
 * LinkedIn. Covers: post now, the never-twice publish lock, retries, auth failures, repeats, duplicates, approvals,
 * the sweep, tracked links and every report query.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db, useDbForTests } from "@/db";
import { PLATFORMS } from "@/platforms";
import { PlatformError, type PlatformAdapter } from "@/platforms/types";

process.env.TOKEN_KEY = "a".repeat(64);
process.env.APP_URL = "https://sp.example";

const { encrypt } = await import("@/lib/crypto");
const { savePost, decide } = await import("@/server/posts");
const { publishTarget, resolveLink } = await import("@/server/publish");
const { sweep, rollup } = await import("@/server/sweep");
const { setSetting } = await import("@/lib/settings");
const Q = await import("@/server/queries");

let published: { urn: string; text: string; link?: string | null }[] = [];
let mode: "ok" | "retry" | "auth" = "ok";
const fakeLinkedIn: PlatformAdapter = {
  id: "linkedin", label: "LinkedIn", kinds: ["page", "profile"],
  configured: () => true, connectUrl: () => "", exchange: async () => { throw new Error("n/a"); }, refresh: async () => { throw new Error("n/a"); },
  options: async () => [], check: async () => ({ ok: true, note: "ok" }), uploadImage: async () => "urn:li:image:1",
  async publish(acc, _tok, input) {
    await new Promise((r) => setTimeout(r, 5));
    if (mode === "retry") throw new PlatformError("LinkedIn had a problem (503); it is tried again.", true);
    if (mode === "auth") throw new PlatformError("expired", false, true);
    published.push({ urn: acc.urn, text: input.text, link: input.link });
    const id = `urn:li:share:${published.length}`;
    return { externalId: id, url: `https://www.linkedin.com/feed/update/${id}/` };
  },
  async stats(_acc, _tok, ids) {
    return { byId: Object.fromEntries(ids.map((id) => [id, { impressions: 100, uniqueImpressions: 80, clicks: 5, reactions: 7, comments: 2, shares: 1 }])), note: "" };
  },
};

let admin: { id: number; email: string; name: string; role: "admin" };
let editor: { id: number; email: string; name: string; role: "editor" };
let pageId = 0, profileId = 0;

beforeAll(async () => {
  const pg = new PGlite();
  const ddl = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0000_init.sql"), "utf8");
  for (const stmt of ddl.split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
  useDbForTests(drizzle(pg, { schema }));
  PLATFORMS.linkedin = fakeLinkedIn;
  const [a] = await db().insert(schema.users).values({ name: "Ann Admin", email: "a@x", passwordHash: "x", role: "admin" }).returning();
  const [e] = await db().insert(schema.users).values({ name: "Ed Editor", email: "e@x", passwordHash: "x", role: "editor" }).returning();
  admin = { id: a.id, email: a.email, name: a.name, role: "admin" };
  editor = { id: e.id, email: e.email, name: e.name, role: "editor" };
  const far = new Date(Date.now() + 50 * 864e5);
  const [p] = await db().insert(schema.socialAccounts).values({ platform: "linkedin", kind: "page", externalId: "5", urn: "urn:li:organization:5",
    name: "PGI Page", tokenEnc: encrypt("tok"), tokenExpiresAt: far }).returning();
  const [m] = await db().insert(schema.socialAccounts).values({ platform: "linkedin", kind: "profile", externalId: "abc", urn: "urn:li:person:abc",
    name: "Ann", tokenEnc: encrypt("tok2"), tokenExpiresAt: far }).returning();
  pageId = p.id; profileId = m.id;
});

beforeEach(() => { published = []; mode = "ok"; });

const base = { linkUrl: "", linkTitle: "", imageUrl: "", date: "", time: "", timezone: "Europe/Malta", rrule: "", allowDuplicate: false };
let n = 0;
const uniq = (s: string) => `${s} #${++n}`;

describe("posting", () => {
  it("posts now to two accounts, with our tracked link", async () => {
    const r = await savePost({ ...base, text: uniq("Hello world"), linkUrl: "https://paragon.example/jobs", accountIds: [pageId, profileId], mode: "now" }, admin);
    expect(r.ok).toBe(true);
    expect(published.map((p) => p.urn).sort()).toEqual(["urn:li:organization:5", "urn:li:person:abc"]);
    expect(published[0].link).toMatch(/^https:\/\/sp\.example\/r\/[\w-]+$/);
    if (!r.ok) return;
    const [post] = await db().select().from(schema.posts).where(eq(schema.posts.id, r.postId));
    expect(post.status).toBe("published");
    const code = published[0].link!.split("/r/")[1];
    const link = await resolveLink(code);
    expect(link?.url).toMatch(/utm_source=linkedin&utm_medium=social/);
    await db().insert(schema.linkClicks).values({ targetId: link!.targetId });
  });

  it("never publishes the same target twice, even with 5 calls at once", async () => {
    const [p] = await db().insert(schema.posts).values({ text: uniq("Once"), status: "scheduled", scheduledAt: new Date() }).returning();
    const [t] = await db().insert(schema.postTargets).values({ postId: p.id, accountId: pageId, scheduledAt: new Date(), linkCode: `c${p.id}` }).returning();
    const out = await Promise.all([1, 2, 3, 4, 5].map(() => publishTarget(t.id)));
    expect(published.length).toBe(1);
    expect(out.filter((o) => o.status === "published").length).toBe(1);
    expect(out.filter((o) => o.status === "skipped").length).toBe(4);
  });

  it("does not publish before the scheduled time", async () => {
    const at = new Date(Date.now() + 3600_000);
    const [p] = await db().insert(schema.posts).values({ text: uniq("Later"), status: "scheduled", scheduledAt: at }).returning();
    const [t] = await db().insert(schema.postTargets).values({ postId: p.id, accountId: pageId, scheduledAt: at, linkCode: `l${p.id}` }).returning();
    expect((await publishTarget(t.id)).status).toBe("skipped");
    expect(published.length).toBe(0);
  });

  it("retries a temporary LinkedIn error later, and fails after 3 attempts", async () => {
    mode = "retry";
    const [p] = await db().insert(schema.posts).values({ text: uniq("Flaky"), status: "scheduled", scheduledAt: new Date() }).returning();
    const [t] = await db().insert(schema.postTargets).values({ postId: p.id, accountId: pageId, scheduledAt: new Date(), linkCode: `f${p.id}` }).returning();
    expect((await publishTarget(t.id)).status).toBe("retry");
    let [row] = await db().select().from(schema.postTargets).where(eq(schema.postTargets.id, t.id));
    expect(row.status).toBe("scheduled");
    expect(row.scheduledAt.getTime()).toBeGreaterThan(Date.now());
    for (let i = 0; i < 2; i++) {
      await db().update(schema.postTargets).set({ scheduledAt: new Date() }).where(eq(schema.postTargets.id, t.id));
      await publishTarget(t.id);
    }
    [row] = await db().select().from(schema.postTargets).where(eq(schema.postTargets.id, t.id));
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(3);
    const [post] = await db().select().from(schema.posts).where(eq(schema.posts.id, p.id));
    expect(post.status).toBe("failed");
  });

  it("marks the account expired on an auth error, without retrying", async () => {
    mode = "auth";
    const [p] = await db().insert(schema.posts).values({ text: uniq("Auth"), status: "scheduled", scheduledAt: new Date() }).returning();
    const [t] = await db().insert(schema.postTargets).values({ postId: p.id, accountId: profileId, scheduledAt: new Date(), linkCode: `a${p.id}` }).returning();
    expect((await publishTarget(t.id)).status).toBe("failed");
    const [acc] = await db().select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, profileId));
    expect(acc.status).toBe("expired");
    await db().update(schema.socialAccounts).set({ status: "active", lastError: null }).where(eq(schema.socialAccounts.id, profileId));
  });

  it("schedules the next post of a repeating series once one goes out", async () => {
    const r = await savePost({ ...base, text: uniq("Daily tip"), accountIds: [pageId], mode: "now", rrule: "FREQ=DAILY;COUNT=3" }, admin);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const series = await db().select().from(schema.posts).where(eq(schema.posts.seriesId, r.postId));
    expect(series.length).toBe(1);
    expect(series[0].status).toBe("scheduled");
    expect(series[0].scheduledAt!.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
  });

  it("refuses the same text on the same account within 24 hours, unless allowed", async () => {
    const text = uniq("Same");
    expect((await savePost({ ...base, text, accountIds: [pageId], mode: "now" }, admin)).ok).toBe(true);
    const again = await savePost({ ...base, text, accountIds: [pageId], mode: "now" }, admin);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.duplicate).toBe(true);
    expect((await savePost({ ...base, text, accountIds: [pageId], mode: "now", allowDuplicate: true }, admin)).ok).toBe(true);
  });

  it("refuses unfilled template fields and past times", async () => {
    expect(await savePost({ ...base, text: "Role {{job_title}}", accountIds: [pageId], mode: "now" }, admin)).toMatchObject({ ok: false });
    expect(await savePost({ ...base, text: uniq("x"), accountIds: [pageId], mode: "schedule", date: "2020-01-01", time: "10:00" }, admin)).toMatchObject({ ok: false });
  });
});

describe("approval and the sweep", () => {
  it("holds an editor's post until an admin approves it; the sweep never sends held posts", async () => {
    await setSetting("approval_required", true);
    const r = await savePost({ ...base, text: uniq("Needs OK"), accountIds: [pageId], mode: "now" }, editor);
    expect(r).toMatchObject({ ok: true, status: "needs_approval" });
    await sweep(20_000);
    expect(published.length).toBe(0);
    expect((await Q.approvalsQueue()).length).toBe(1);
    if (!r.ok) return;
    expect(await decide(r.postId, true, admin)).toBe("Approved and published.");
    expect(published.length).toBe(1);
    await setSetting("approval_required", false);
  });

  it("the sweep publishes due posts and reads the numbers", async () => {
    const [p] = await db().insert(schema.posts).values({ text: uniq("Due"), status: "scheduled", scheduledAt: new Date(Date.now() - 60_000) }).returning();
    await db().insert(schema.postTargets).values({ postId: p.id, accountId: pageId, scheduledAt: new Date(Date.now() - 60_000), linkCode: `d${p.id}` });
    const out = await sweep(20_000);
    expect(out.published).toBeGreaterThanOrEqual(1);
    expect(out.stats).toBeGreaterThan(0);
    const [{ c }] = (await db().execute(sql`select count(*)::int c from post_stats`)).rows as { c: number }[];
    expect(c).toBeGreaterThan(0);
  });
});

describe("report queries", () => {
  it("all run and add up", async () => {
    await rollup();
    const t = await Q.totals(30);
    expect(t.posts).toBeGreaterThan(0);
    expect(t.impressions).toBe(t.posts * 100);
    expect(t.link_clicks).toBe(1);
    expect((await Q.daily(7)).length).toBe(7);
    expect((await Q.byAccount(30)).find((a) => a.account_id === pageId)!.posts).toBeGreaterThan(0);
    expect((await Q.topPosts(30)).length).toBeGreaterThan(0);
    expect((await Q.byTemplate(30))[0].template).toBe("No template");
    expect((await Q.bestTimes(90, "Europe/Malta")).length).toBeGreaterThan(0);
    const list = await Q.postList({ status: "published", q: "Hello" });
    expect(list[0].total).toBe(2);
    expect((await Q.postList({ account: pageId, page: 1 })).length).toBeGreaterThan(0);
    expect((await Q.upcoming()).length).toBeGreaterThan(0);
    expect((await Q.recentPublished()).length).toBeGreaterThan(0);
    expect((await Q.failures()).length).toBeGreaterThan(0);
    expect(await Q.drafts()).toEqual([]);
    const from = new Date(Date.now() - 864e5).toISOString(), to = new Date(Date.now() + 3 * 864e5).toISOString();
    expect((await Q.calendarRange(from, to)).length).toBeGreaterThan(0);
  });
});
