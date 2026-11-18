import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Read-only queries for the pages. Each is a single round-trip to the database. */

type Row = Record<string, unknown>;
async function rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> {
  const r = await db().execute(q);
  return r.rows as T[];
}

export type TargetRow = {
  target_id: number; post_id: number; status: string; scheduled_at: string; published_at: string | null; url: string | null;
  error: string | null; account_id: number; account_name: string; color: string; kind: string; text: string; image_url: string | null;
  link_url: string | null; rrule: string | null; post_status: string; author: string | null;
  impressions: number | null; reactions: number | null; comments: number | null; shares: number | null; clicks: number | null; link_clicks: number;
};

const TARGET_SELECT = sql`
  select t.id target_id, p.id post_id, t.status, t.scheduled_at, t.published_at, t.url, t.error, a.id account_id,
    a.name account_name, a.color, a.kind, p.text, p.image_url, p.link_url, p.rrule, p.status post_status, u.name author,
    s.impressions, s.reactions, s.comments, s.shares, s.clicks, coalesce(c.n, 0)::int link_clicks
  from post_targets t
  join posts p on p.id = t.post_id
  join social_accounts a on a.id = t.account_id
  left join users u on u.id = p.created_by
  left join lateral (select impressions, reactions, comments, shares, clicks from post_stats where target_id = t.id order by at desc limit 1) s on true
  left join lateral (select count(*)::int n from link_clicks where target_id = t.id) c on true`;

export function upcoming(limit = 8) {
  return rows<TargetRow>(sql`${TARGET_SELECT} where t.status in ('scheduled','held','publishing') order by t.scheduled_at asc limit ${limit}`);
}
export function recentPublished(limit = 6) {
  return rows<TargetRow>(sql`${TARGET_SELECT} where t.status = 'published' order by t.published_at desc limit ${limit}`);
}
export function failures(days = 14) {
  return rows<TargetRow>(sql`${TARGET_SELECT} where t.status = 'failed' and t.updated_at > now() - make_interval(days => ${days}) order by t.updated_at desc limit 20`);
}

export type PostFilter = { status?: string; account?: number; q?: string; from?: string; to?: string; page?: number };
export async function postList(f: PostFilter, pageSize = 25) {
  const where = [sql`true`];
  if (f.status) where.push(sql`t.status = ${f.status}`);
  if (f.account) where.push(sql`t.account_id = ${f.account}`);
  if (f.q) where.push(sql`p.text ilike ${"%" + f.q.replace(/[%_]/g, "") + "%"}`);
  if (f.from) where.push(sql`t.scheduled_at >= ${f.from}::date`);
  if (f.to) where.push(sql`t.scheduled_at < (${f.to}::date + 1)`);
  const w = sql.join(where, sql` and `);
  const off = Math.max(0, ((f.page || 1) - 1) * pageSize);
  return rows<TargetRow & { total: number }>(sql`select x.*, count(*) over()::int total from (${TARGET_SELECT} where ${w}) x
    order by coalesce(x.published_at, x.scheduled_at) desc limit ${pageSize} offset ${off}`);
}

/** Posts of the calendar month (in UTC bounds a little wider than the month, the page places them by timezone). */
export function calendarRange(fromIso: string, toIso: string) {
  return rows<TargetRow>(sql`${TARGET_SELECT} where t.scheduled_at >= ${fromIso}::timestamptz and t.scheduled_at < ${toIso}::timestamptz
    and t.status <> 'cancelled' order by t.scheduled_at asc limit 1000`);
}

export function drafts() {
  return rows<{ id: number; text: string; created_at: string; author: string | null }>(sql`
    select p.id, p.text, p.created_at, u.name author from posts p left join users u on u.id = p.created_by
    where p.status = 'draft' order by p.created_at desc limit 20`);
}

export function approvalsQueue() {
  return rows<{ id: number; text: string; image_url: string | null; link_url: string | null; scheduled_at: string | null; timezone: string;
    rrule: string | null; author: string | null; accounts: string }>(sql`
    select p.id, p.text, p.image_url, p.link_url, p.scheduled_at, p.timezone, p.rrule, u.name author,
      (select string_agg(a.name, ', ') from post_targets t join social_accounts a on a.id = t.account_id where t.post_id = p.id) accounts
    from posts p left join users u on u.id = p.created_by where p.status = 'needs_approval' order by p.scheduled_at nulls first`);
}

/* ------------------------------ reports (from stats_daily) ------------------------------ */

export type Totals = { posts: number; impressions: number; reactions: number; comments: number; shares: number; clicks: number; link_clicks: number };

export async function totals(days: number, account?: number): Promise<Totals & { prev: Totals }> {
  const acc = account ? sql`and account_id = ${account}` : sql``;
  const [r] = await rows<Row>(sql`select
    ${sumCols(sql`day > current_date - ${days}::int`)}, ${sumCols(sql`day <= current_date - ${days}::int and day > current_date - ${days * 2}::int`, "p_")}
    from stats_daily where day > current_date - ${days * 2}::int ${acc}`);
  const pick = (pre: string): Totals => ({ posts: n(r[pre + "posts"]), impressions: n(r[pre + "impressions"]), reactions: n(r[pre + "reactions"]),
    comments: n(r[pre + "comments"]), shares: n(r[pre + "shares"]), clicks: n(r[pre + "clicks"]), link_clicks: n(r[pre + "link_clicks"]) });
  return { ...pick(""), prev: pick("p_") };
}
function sumCols(cond: ReturnType<typeof sql>, pre = "") {
  const cols = ["posts", "impressions", "reactions", "comments", "shares", "clicks", "link_clicks"];
  return sql.join(cols.map((c) => sql`coalesce(sum(${sql.identifier(c)}) filter (where ${cond}),0)::int as ${sql.identifier(pre + c)}`), sql`, `);
}
const n = (v: unknown) => Number(v) || 0;

export function daily(days: number, account?: number) {
  const acc = account ? sql`and account_id = ${account}` : sql``;
  return rows<{ day: string } & Totals>(sql`
    select to_char(g.day, 'YYYY-MM-DD') as day, coalesce(sum(s.posts),0)::int posts, coalesce(sum(s.impressions),0)::int impressions,
      coalesce(sum(s.reactions),0)::int reactions, coalesce(sum(s.comments),0)::int comments, coalesce(sum(s.shares),0)::int shares,
      coalesce(sum(s.clicks),0)::int clicks, coalesce(sum(s.link_clicks),0)::int link_clicks
    from generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') g(day)
    left join stats_daily s on s.day = g.day::date ${acc}
    group by g.day order by g.day`);
}

export function byAccount(days: number) {
  return rows<{ account_id: number; name: string; color: string; kind: string } & Totals>(sql`
    select a.id account_id, a.name, a.color, a.kind, coalesce(sum(s.posts),0)::int posts, coalesce(sum(s.impressions),0)::int impressions,
      coalesce(sum(s.reactions),0)::int reactions, coalesce(sum(s.comments),0)::int comments, coalesce(sum(s.shares),0)::int shares,
      coalesce(sum(s.clicks),0)::int clicks, coalesce(sum(s.link_clicks),0)::int link_clicks
    from social_accounts a left join stats_daily s on s.account_id = a.id and s.day > current_date - ${days}::int
    where a.status <> 'disconnected' group by a.id order by impressions desc, posts desc`);
}

export function topPosts(days: number, account?: number, limit = 10) {
  const acc = account ? sql`and t.account_id = ${account}` : sql``;
  return rows<TargetRow & { engagement: number }>(sql`select x.*, (coalesce(x.reactions,0) + coalesce(x.comments,0) + coalesce(x.shares,0))::int engagement
    from (${TARGET_SELECT} where t.status = 'published' and t.published_at > now() - make_interval(days => ${days}) ${acc}) x
    order by engagement desc, x.impressions desc nulls last, x.link_clicks desc limit ${limit}`);
}

export function byTemplate(days: number) {
  return rows<{ template: string; posts: number; engagement: number; link_clicks: number }>(sql`
    select coalesce(tp.name, 'No template') template, count(*)::int posts,
      coalesce(sum(coalesce(s.reactions,0) + coalesce(s.comments,0) + coalesce(s.shares,0)),0)::int engagement,
      coalesce(sum(c.n),0)::int link_clicks
    from post_targets t join posts p on p.id = t.post_id left join templates tp on tp.id = p.template_id
    left join lateral (select reactions, comments, shares from post_stats where target_id = t.id order by at desc limit 1) s on true
    left join lateral (select count(*)::int n from link_clicks where target_id = t.id) c on true
    where t.status = 'published' and t.published_at > now() - make_interval(days => ${days})
    group by 1 order by engagement desc`);
}

/** Average engagement per post by weekday and hour (in the given timezone): when to post. */
export function bestTimes(days: number, tz: string) {
  return rows<{ dow: number; hour: number; posts: number; avg_eng: number }>(sql`
    select extract(dow from t.published_at at time zone ${tz})::int as dow, extract(hour from t.published_at at time zone ${tz})::int as hour,
      count(*)::int posts, round(avg(coalesce(s.reactions,0) + coalesce(s.comments,0) + coalesce(s.shares,0)), 1)::float avg_eng
    from post_targets t
    left join lateral (select reactions, comments, shares from post_stats where target_id = t.id order by at desc limit 1) s on true
    where t.status = 'published' and t.published_at > now() - make_interval(days => ${days})
    group by 1, 2`);
}
