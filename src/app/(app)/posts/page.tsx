import Link from "next/link";
import { asc, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtWhen } from "@/lib/time";
import { describeRule } from "@/lib/recur";
import { drafts, postList } from "@/server/queries";
import { ActionButton } from "@/components/action-button";
import { StatusPill, fmtNum } from "@/components/ui";
import { cancelAction, retryAction } from "../actions";

export const metadata = { title: "Posts" };
const STATUSES = ["scheduled", "held", "published", "failed", "cancelled"];

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("viewer");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const f = { status: STATUSES.includes(sp.status ?? "") ? sp.status : undefined, account: Number(sp.account) || undefined,
    q: (sp.q || "").slice(0, 80) || undefined, from: /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to : undefined, page };
  const [s, list, accounts, dr] = await Promise.all([
    getSettings(), postList(f),
    db().select({ id: schema.socialAccounts.id, name: schema.socialAccounts.name }).from(schema.socialAccounts)
      .where(ne(schema.socialAccounts.status, "disconnected")).orderBy(asc(schema.socialAccounts.name)),
    page === 1 && !f.status ? drafts() : Promise.resolve([]),
  ]);
  const tz = s.default_timezone;
  const total = list[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const qs = (p: number) => "?" + new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Posts</h1><p className="mut mt-1">Every post on every account. {total} found.</p></div>
        {can(user, "editor") && <Link href="/compose" className="btn btn-primary">New post</Link>}
      </div>

      <form className="card grid gap-2 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <input name="q" defaultValue={f.q} placeholder="Search text…" className="input lg:col-span-2" aria-label="Search text" />
        <select name="status" defaultValue={f.status ?? ""} className="input" aria-label="Status">
          <option value="">All statuses</option>{STATUSES.map((x) => <option key={x} value={x}>{x === "held" ? "waiting approval" : x}</option>)}
        </select>
        <select name="account" defaultValue={f.account ?? ""} className="input" aria-label="Account">
          <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={f.from} className="input" aria-label="From date" />
        <div className="flex gap-2"><input type="date" name="to" defaultValue={f.to} className="input" aria-label="To date" /><button className="btn">Filter</button></div>
      </form>

      {dr.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-2">Drafts</h2>
          <ul className="divide-y divide-line">
            {dr.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{d.text}</span>
                <span className="mut text-xs">{d.author}</span>
                {can(user, "editor") && <Link href={`/compose?from=${d.id}`} className="btn btn-sm">Open</Link>}
                {can(user, "editor") && <ActionButton action={cancelAction.bind(null, d.id)} confirmText="Delete this draft?">Delete</ActionButton>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Post</th><th>Account</th><th>When</th><th>Status</th><th className="text-right">Views</th><th className="text-right">Reactions</th><th className="text-right">Comments</th><th className="text-right">Clicks</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={9} className="mut py-10 text-center">No posts match.</td></tr>}
            {list.map((r) => (
              <tr key={r.target_id}>
                <td className="max-w-sm">
                  <div className="line-clamp-2 text-[13px]">{r.text}</div>
                  <div className="mut text-xs">{r.author}{r.rrule ? ` · ${describeRule(r.rrule)}` : ""}</div>
                  {r.error && <div className="text-xs text-bad">{r.error}</div>}
                </td>
                <td className="whitespace-nowrap"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden />{r.account_name}</td>
                <td className="whitespace-nowrap">{fmtWhen(r.published_at ?? r.scheduled_at, tz)}</td>
                <td><StatusPill status={r.status} /></td>
                <td className="text-right tabular-nums">{fmtNum(r.impressions)}</td>
                <td className="text-right tabular-nums">{fmtNum(r.reactions)}</td>
                <td className="text-right tabular-nums">{fmtNum(r.comments)}</td>
                <td className="text-right tabular-nums">{fmtNum(r.link_clicks)}</td>
                <td className="whitespace-nowrap text-right">
                  <span className="inline-flex gap-1">
                    {r.url && <a className="btn btn-sm" href={r.url} target="_blank" rel="noopener noreferrer">Open ↗</a>}
                    {can(user, "editor") && r.status === "failed" && <ActionButton action={retryAction.bind(null, r.target_id)}>Retry</ActionButton>}
                    {can(user, "editor") && ["scheduled", "held"].includes(r.status) && <ActionButton action={cancelAction.bind(null, r.post_id)} className="btn btn-sm btn-danger" confirmText="Cancel this post on all its accounts (and stop its repeats)?">Cancel</ActionButton>}
                    {can(user, "editor") && <Link className="btn btn-sm" href={`/compose?from=${r.post_id}`} title="Start a new post from this one">Copy</Link>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2 text-[13px]" aria-label="Pages">
          {page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>← Newer</Link>}
          <span className="mut">Page {page} of {pages}</span>
          {page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Older →</Link>}
        </nav>
      )}
    </div>
  );
}
