import Link from "next/link";
import { and, ne, lt, or, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtWhen } from "@/lib/time";
import { describeRule } from "@/lib/recur";
import { failures, recentPublished, totals, upcoming, approvalsQueue, type TargetRow } from "@/server/queries";
import { ActionButton } from "@/components/action-button";
import { Tile, StatusPill, fmtNum } from "@/components/ui";
import { retryAction } from "./actions";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePage("viewer");
  const sp = await searchParams;
  const [s, t7, t30, next, recent, failed, queue, attention] = await Promise.all([
    getSettings(), totals(7), totals(30), upcoming(8), recentPublished(6), failures(14), approvalsQueue(),
    db().select({ id: schema.socialAccounts.id, name: schema.socialAccounts.name, status: schema.socialAccounts.status, tokenExpiresAt: schema.socialAccounts.tokenExpiresAt })
      .from(schema.socialAccounts).where(and(ne(schema.socialAccounts.status, "disconnected"),
        or(ne(schema.socialAccounts.status, "active"), lt(schema.socialAccounts.tokenExpiresAt, new Date(Date.now() + 7 * 864e5)), eq(schema.socialAccounts.status, "error")))),
  ]);
  const tz = s.default_timezone;
  const eng = t30.reactions + t30.comments + t30.shares;
  const rate = t30.impressions ? (eng / t30.impressions) * 100 : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Hello {user.name.split(" ")[0]}</h1>
          <p className="mut mt-1">What is going out, what went out, and how it did. Times in {tz}.</p>
        </div>
        {can(user, "editor") && <Link href="/compose" className="btn btn-primary">New post</Link>}
      </div>
      {sp.denied && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">Your role does not open that page.</p>}

      {(attention.length > 0 || (can(user, "admin") && queue.length > 0)) && (
        <div className="space-y-2">
          {attention.map((a) => (
            <p key={a.id} className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
              <b>{a.name}</b>: {a.status !== "active" ? `connection ${a.status}` : `the connection ends ${fmtWhen(a.tokenExpiresAt, tz)}`}. <Link href="/accounts" className="underline">Reconnect</Link>
            </p>
          ))}
          {can(user, "admin") && queue.length > 0 && (
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-[13px] text-brand"><b>{queue.length}</b> post{queue.length > 1 ? "s" : ""} waiting for your approval. <Link href="/approvals" className="underline">Review</Link></p>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Published, 7 days" value={fmtNum(t7.posts)} prev={t7.prev.posts} now={t7.posts} />
        <Tile label="Scheduled next" value={fmtNum(next.length >= 8 ? "8+" : next.length)} />
        <Tile label="Impressions, 30 days" value={fmtNum(t30.impressions)} prev={t30.prev.impressions} now={t30.impressions} />
        <Tile label="Engagement rate, 30 days" value={rate === null ? "–" : `${rate.toFixed(1)}%`} hint="reactions + comments + shares ÷ impressions" />
        <Tile label="Link clicks, 30 days" value={fmtNum(t30.link_clicks)} prev={t30.prev.link_clicks} now={t30.link_clicks} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="h2">Coming up</h2><Link href="/calendar" className="text-xs text-brand">Calendar →</Link></div>
          {next.length === 0 ? <Empty text="Nothing scheduled." /> : (
            <ul className="divide-y divide-line">{next.map((r) => <Item key={r.target_id} r={r} tz={tz} when={r.scheduled_at} />)}</ul>
          )}
        </section>
        <section className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="h2">Recently published</h2><Link href="/posts?status=published" className="text-xs text-brand">All posts →</Link></div>
          {recent.length === 0 ? <Empty text="Nothing published yet." /> : (
            <ul className="divide-y divide-line">{recent.map((r) => <Item key={r.target_id} r={r} tz={tz} when={r.published_at} stats />)}</ul>
          )}
        </section>
      </div>

      {failed.length > 0 && (
        <section className="card border-bad-soft">
          <h2 className="h2 mb-3 text-bad">Needs attention: {failed.length} failed</h2>
          <ul className="divide-y divide-line">
            {failed.map((r) => (
              <li key={r.target_id} className="flex flex-wrap items-start gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{r.text.slice(0, 120)}</div>
                  <div className="text-xs text-bad">{r.account_name}: {r.error}</div>
                </div>
                {can(user, "editor") && <ActionButton action={retryAction.bind(null, r.target_id)}>Retry</ActionButton>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) { return <p className="mut py-6 text-center text-[13px]">{text}</p>; }

function Item({ r, tz, when, stats }: { r: TargetRow; tz: string; when: string | null; stats?: boolean }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{r.text.replace(/\s+/g, " ").slice(0, 140)}</div>
        <div className="mut mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span>{r.account_name}</span><span>·</span><span>{fmtWhen(when, tz)}</span>
          {r.rrule && <span className="text-brand">· {describeRule(r.rrule)}</span>}
          {stats && <span>· {fmtNum(r.impressions ?? 0)} views · {fmtNum((r.reactions ?? 0) + (r.comments ?? 0))} reactions/comments · {fmtNum(r.link_clicks)} clicks</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand">Open ↗</a> : <StatusPill status={r.status} />}
      </div>
    </li>
  );
}
