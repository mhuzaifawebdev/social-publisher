import Link from "next/link";
import { can, requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtWhen } from "@/lib/time";
import { bestTimes, byAccount, byTemplate, daily, topPosts, totals } from "@/server/queries";
import { ActionButton } from "@/components/action-button";
import { Tile, fmtNum } from "@/components/ui";
import { refreshStatsAction } from "../actions";
import { DailyCharts } from "./charts";

export const metadata = { title: "Reports" };
const PERIODS = [7, 30, 90];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ d?: string; account?: string }> }) {
  const user = await requirePage("viewer");
  const sp = await searchParams;
  const days = PERIODS.includes(Number(sp.d)) ? Number(sp.d) : 30;
  const account = Number(sp.account) || undefined;
  const s = await getSettings();
  const tz = s.default_timezone;
  const [t, series, accounts, top, tpl, best] = await Promise.all([
    totals(days, account), daily(days, account), byAccount(days), topPosts(days, account, 10), byTemplate(days), bestTimes(90, tz),
  ]);
  const eng = t.reactions + t.comments + t.shares;
  const peng = t.prev.reactions + t.prev.comments + t.prev.shares;
  const q = (p: Record<string, string | number | undefined>) => "?" + new URLSearchParams(Object.entries({ d: days, account, ...p })
    .filter(([, v]) => v !== undefined && String(v) !== "").map(([k, v]) => [k, String(v)])).toString();

  const heat = new Map(best.map((b) => [`${b.dow}-${b.hour}`, b]));
  const maxEng = Math.max(1, ...best.map((b) => b.avg_eng));
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => h >= 6 && h <= 22);
  const top3 = [...best].filter((b) => b.posts >= 2).sort((a, b) => b.avg_eng - a.avg_eng).slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Reports</h1><p className="mut mt-1">How the posts did. LinkedIn&apos;s numbers are read every 3 hours for posts under 30 days old.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-[13px]">
            {PERIODS.map((p) => <Link key={p} href={q({ d: p })} className={`rounded-md px-3 py-1 ${p === days ? "bg-white font-semibold shadow-sm" : "text-mut"}`}>{p} days</Link>)}
          </div>
          <form className="flex gap-1" action="/reports">
            <input type="hidden" name="d" value={days} />
            <select name="account" defaultValue={account ?? ""} className="input w-auto" aria-label="Account">
              <option value="">All accounts</option>{accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
            </select>
            <button className="btn">Show</button>
          </form>
          {can(user, "editor") && <ActionButton action={refreshStatsAction}>Refresh LinkedIn numbers</ActionButton>}
          <a className="btn" href={`/api/reports/csv${q({})}`}>Download CSV</a>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Posts" value={fmtNum(t.posts)} prev={t.prev.posts} now={t.posts} />
        <Tile label="Impressions" value={fmtNum(t.impressions)} prev={t.prev.impressions} now={t.impressions} hint="Page posts only: LinkedIn gives no impressions for personal profiles" />
        <Tile label="Engagement" value={fmtNum(eng)} prev={peng} now={eng} hint="reactions + comments + shares" />
        <Tile label="Engagement rate" value={t.impressions ? `${((eng / t.impressions) * 100).toFixed(1)}%` : "–"} />
        <Tile label="Link clicks" value={fmtNum(t.link_clicks)} prev={t.prev.link_clicks} now={t.link_clicks} hint="counted by our own short link" />
      </section>
      <p className="mut -mt-2 text-xs">Arrows compare with the {days} days before.</p>

      <DailyCharts data={series} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-x-auto p-0">
          <h2 className="h2 px-4 pt-4">By account</h2>
          <table className="tbl mt-2"><thead><tr><th>Account</th><th className="text-right">Posts</th><th className="text-right">Impressions</th><th className="text-right">Engagement</th><th className="text-right">Clicks</th></tr></thead><tbody>
            {accounts.map((a) => (
              <tr key={a.account_id}>
                <td><Link href={q({ account: a.account_id })} className="hover:text-brand"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: a.color }} aria-hidden />{a.name}</Link></td>
                <td className="text-right tabular-nums">{a.posts}</td><td className="text-right tabular-nums">{fmtNum(a.impressions)}</td>
                <td className="text-right tabular-nums">{fmtNum(a.reactions + a.comments + a.shares)}</td><td className="text-right tabular-nums">{fmtNum(a.link_clicks)}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
        <section className="card overflow-x-auto p-0">
          <h2 className="h2 px-4 pt-4">By template</h2>
          <table className="tbl mt-2"><thead><tr><th>Template</th><th className="text-right">Posts</th><th className="text-right">Engagement</th><th className="text-right">Per post</th><th className="text-right">Clicks</th></tr></thead><tbody>
            {tpl.length === 0 && <tr><td colSpan={5} className="mut py-6 text-center">No published posts in this period.</td></tr>}
            {tpl.map((r) => (
              <tr key={r.template}><td>{r.template}</td><td className="text-right tabular-nums">{r.posts}</td><td className="text-right tabular-nums">{fmtNum(r.engagement)}</td>
                <td className="text-right tabular-nums">{r.posts ? (r.engagement / r.posts).toFixed(1) : "–"}</td><td className="text-right tabular-nums">{fmtNum(r.link_clicks)}</td></tr>
            ))}
          </tbody></table>
        </section>
      </div>

      <section className="card overflow-x-auto p-0">
        <h2 className="h2 px-4 pt-4">Top posts</h2>
        <table className="tbl mt-2"><thead><tr><th>Post</th><th>Account</th><th>Published</th><th className="text-right">Impressions</th><th className="text-right">Reactions</th><th className="text-right">Comments</th><th className="text-right">Shares</th><th className="text-right">Clicks</th></tr></thead><tbody>
          {top.length === 0 && <tr><td colSpan={8} className="mut py-6 text-center">No published posts in this period.</td></tr>}
          {top.map((r) => (
            <tr key={r.target_id}>
              <td className="max-w-xs">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:text-brand">{r.text}</a> : <span className="line-clamp-2">{r.text}</span>}</td>
              <td className="whitespace-nowrap">{r.account_name}</td><td className="whitespace-nowrap">{fmtWhen(r.published_at, tz)}</td>
              <td className="text-right tabular-nums">{fmtNum(r.impressions)}</td><td className="text-right tabular-nums">{fmtNum(r.reactions)}</td>
              <td className="text-right tabular-nums">{fmtNum(r.comments)}</td><td className="text-right tabular-nums">{fmtNum(r.shares)}</td><td className="text-right tabular-nums">{fmtNum(r.link_clicks)}</td>
            </tr>
          ))}
        </tbody></table>
      </section>

      <section className="card">
        <h2 className="h2">Best time to post</h2>
        <p className="mut mb-3 text-xs">Average engagement per post by day and hour ({tz}), last 90 days. Darker = better.{top3.length ? ` Best so far: ${top3.map((b) => `${DOW[b.dow]} ${String(b.hour).padStart(2, "0")}:00`).join(", ")}.` : " It fills in as posts go out."}</p>
        <div className="overflow-x-auto">
          <table className="border-separate [border-spacing:2px] text-[10px]" aria-label="Average engagement by weekday and hour">
            <thead><tr><th />{hours.map((h) => <th key={h} className="w-7 font-normal text-mut">{h}</th>)}</tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <tr key={d}><th className="pr-2 text-right font-normal text-mut">{DOW[d]}</th>
                  {hours.map((h) => {
                    const c = heat.get(`${d}-${h}`);
                    const a = c ? 0.12 + 0.88 * (c.avg_eng / maxEng) : 0;
                    return <td key={h} title={c ? `${DOW[d]} ${h}:00 · ${c.posts} post(s) · ${c.avg_eng} avg engagement` : `${DOW[d]} ${h}:00 · no posts`}
                      className="h-6 w-7 rounded" style={{ background: c ? `rgba(10,102,194,${a.toFixed(2)})` : "#f1f5f9" }} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
