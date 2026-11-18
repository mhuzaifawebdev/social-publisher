import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { chooseAccounts } from "../../../actions";

export const metadata = { title: "Choose Pages" };

export default async function ChoosePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requirePage("admin");
  const { id } = await params;
  const err = (await searchParams).err;
  const [s] = await db().select().from(schema.connectSessions)
    .where(and(eq(schema.connectSessions.id, id), eq(schema.connectSessions.userId, user.id)));
  if (!s) redirect("/accounts?error=" + encodeURIComponent("This choice expired. Press Connect again."));
  const have = new Set((await db().select({ urn: schema.socialAccounts.urn }).from(schema.socialAccounts)).map((r) => r.urn));
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="h1">Which Pages should posts go to?</h1>
      <p className="mut mb-4 mt-1">Your LinkedIn sign-in has a role on these Pages. Tick the ones to add. Posting needs Super admin or Content admin.</p>
      {err && <p role="alert" className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{err.slice(0, 300)}</p>}
      <form action={chooseAccounts.bind(null, id)} className="card space-y-2">
        {s.options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-slate-50">
            <input type="checkbox" name="org" value={o.id} defaultChecked={s.options.length === 1 && /admin/i.test(o.role ?? "")} className="h-4 w-4 accent-[#0a66c2]" />
            <span className="font-medium">{o.name}</span>
            <span className="mut ml-auto text-right text-xs">{o.role ? <span className="block font-medium text-ink">{o.role}</span> : null}
              {have.has(o.urn) ? "already added: refreshes the connection" : `Page ${o.id}`}</span>
          </label>
        ))}
        <div className="border-t border-line pt-3">
          <label className="label" htmlFor="manual">Page not in the list? Type its ID or link (e.g. 106895244 or linkedin.com/company/106895244)</label>
          <input id="manual" name="manual" className="input" placeholder="106895244" />
          <p className="mut mt-1 text-xs">The tool checks that this LinkedIn sign-in may post on it before adding it.</p>
        </div>
        <div className="flex gap-2 pt-2">
          <button className="btn btn-primary">Add selected Pages</button>
          <a href="/accounts" className="btn">Cancel</a>
        </div>
      </form>
    </div>
  );
}
