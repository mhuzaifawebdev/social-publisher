import "server-only";
import { and, asc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { platform } from "@/platforms";
import { accountToken, ref } from "./accounts";
import { publishTarget, releaseStuck } from "./publish";

const STATS_EVERY_MS = 3 * 3600_000;

/**
 * The safety net, run every 10 minutes (GitHub Actions) and daily (Vercel cron):
 *  1. publishes targets that are due (a lost or late QStash message never loses a post);
 *  2. marks rows stopped half-way as failed (for a person to check);
 *  3. renews tokens that expire within 7 days;
 *  4. reads LinkedIn's numbers for posts under 30 days old, each at most every 3 hours;
 *  5. rebuilds the daily report table for the last 35 days.
 * Each step is time-boxed so the whole run stays well under Vercel's function limit.
 */
export async function sweep(budgetMs = 50_000) {
  const start = Date.now();
  const left = () => budgetMs - (Date.now() - start);
  const d = db();
  const out = { published: 0, failed: 0, stuck: 0, renewed: 0, stats: 0, notes: [] as string[] };

  out.stuck = await releaseStuck();

  const due = await d.select({ id: schema.postTargets.id }).from(schema.postTargets)
    .where(and(eq(schema.postTargets.status, "scheduled"), lte(schema.postTargets.scheduledAt, new Date())))
    .orderBy(asc(schema.postTargets.scheduledAt)).limit(25);
  for (const t of due) {
    if (left() < 15_000) break;
    const r = await publishTarget(t.id);
    if (r.status === "published") out.published++;
    if (r.status === "failed") out.failed++;
  }

  const soon = await d.select().from(schema.socialAccounts).where(and(eq(schema.socialAccounts.status, "active"),
    lt(schema.socialAccounts.tokenExpiresAt, new Date(Date.now() + 7 * 864e5))));
  for (const a of soon) {
    if (left() < 12_000) break;
    try { await accountToken(a); out.renewed++; } catch (e) { out.notes.push(`${a.name}: ${(e as Error).message}`); }
  }

  if (left() > 12_000) out.stats = await refreshStats(left() - 8_000, out.notes);
  if (left() > 3_000) await rollup();
  return out;
}

/** Reads the platforms' numbers, grouped per account (one stats call covers many posts). */
export async function refreshStats(budgetMs: number, notes: string[] = [], force = false) {
  const start = Date.now();
  const d = db();
  const since = new Date(Date.now() - 30 * 864e5);
  const staleBefore = new Date(Date.now() - (force ? 0 : STATS_EVERY_MS));
  const rows = await d.select({ id: schema.postTargets.id, accountId: schema.postTargets.accountId, externalId: schema.postTargets.externalId })
    .from(schema.postTargets)
    .where(and(eq(schema.postTargets.status, "published"), gt(schema.postTargets.publishedAt, since),
      or(isNull(schema.postTargets.statsAt), lt(schema.postTargets.statsAt, staleBefore))))
    .orderBy(asc(sql`coalesce(${schema.postTargets.statsAt}, 'epoch')`)).limit(60);
  const byAcc = new Map<number, typeof rows>();
  for (const r of rows) if (r.externalId) byAcc.set(r.accountId, [...(byAcc.get(r.accountId) ?? []), r]);
  if (!byAcc.size) return 0;
  const accounts = await d.select().from(schema.socialAccounts).where(inArray(schema.socialAccounts.id, [...byAcc.keys()]));
  let n = 0;
  for (const a of accounts) {
    if (Date.now() - start > budgetMs) break;
    const ts = byAcc.get(a.id)!;
    try {
      const token = await accountToken(a);
      const r = await platform(a.platform).stats(ref(a), token, ts.map((t) => t.externalId!));
      if (r.note) notes.push(`${a.name}: ${r.note}`);
      const now = new Date();
      const vals = ts.filter((t) => r.byId[t.externalId!]).map((t) => ({ targetId: t.id, at: now, ...r.byId[t.externalId!] }));
      if (vals.length) await d.insert(schema.postStats).values(vals);
      await d.update(schema.postTargets).set({ statsAt: now }).where(inArray(schema.postTargets.id, ts.map((t) => t.id)));
      n += vals.length;
    } catch (e) { notes.push(`${a.name}: ${(e as Error).message}`); }
  }
  return n;
}

/**
 * stats_daily = per account and day (the day the post was published, UTC): posts, and the latest numbers of each
 * post, plus our own link clicks. Reports read only this small table.
 */
export async function rollup(days = 35) {
  await db().execute(sql`
    insert into stats_daily (day, account_id, posts, impressions, reactions, comments, shares, clicks, link_clicks)
    select (t.published_at at time zone 'UTC')::date, t.account_id, count(*)::int,
      coalesce(sum(s.impressions),0)::int, coalesce(sum(s.reactions),0)::int, coalesce(sum(s.comments),0)::int,
      coalesce(sum(s.shares),0)::int, coalesce(sum(s.clicks),0)::int, coalesce(sum(c.n),0)::int
    from post_targets t
    left join lateral (select impressions, reactions, comments, shares, clicks from post_stats
      where target_id = t.id order by at desc limit 1) s on true
    left join lateral (select count(*)::int n from link_clicks where target_id = t.id) c on true
    where t.status = 'published' and t.published_at > now() - make_interval(days => ${days})
    group by 1, 2
    on conflict (day, account_id) do update set posts = excluded.posts, impressions = excluded.impressions,
      reactions = excluded.reactions, comments = excluded.comments, shares = excluded.shares, clicks = excluded.clicks,
      link_clicks = excluded.link_clicks`);
}
