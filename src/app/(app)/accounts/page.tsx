import { asc, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requirePage } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { fmtWhen } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { PLATFORMS } from "@/platforms";
import { ActionButton } from "@/components/action-button";
import { Flash } from "@/components/flash";
import { disconnectAccount, testAccount } from "../actions";

export const metadata = { title: "Accounts" };

const STATUS: Record<string, string> = { active: "bg-ok-soft text-ok", expired: "bg-warn-soft text-warn", error: "bg-bad-soft text-bad" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePage("viewer");
  const sp = await searchParams;
  const [accounts, s] = await Promise.all([
    db().select().from(schema.socialAccounts).where(ne(schema.socialAccounts.status, "disconnected")).orderBy(asc(schema.socialAccounts.name)),
    getSettings(),
  ]);
  const li = PLATFORMS.linkedin;
  const soon = (d: Date | null) => !!d && d.getTime() - Date.now() < 10 * 864e5;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Accounts</h1>
        <p className="mut mt-1">The social accounts posts can go to. LinkedIn first; more platforms follow.</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="h2">LinkedIn company Page</div>
          <p className="mut mb-3 mt-1 text-xs">Sign in as an admin of the Page; you then tick which of your Pages to add. Needs the approved Community Management app.</p>
          {can(user, "admin") ? (
            li.configured("page") ? <a className="btn btn-primary" href="/api/connect/linkedin/page">Connect LinkedIn Page</a>
              : <p className="text-xs text-warn">Add LINKEDIN_PAGE_CLIENT_ID and LINKEDIN_PAGE_CLIENT_SECRET (or LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET) in Vercel, then redeploy (see README).</p>
          ) : <p className="mut text-xs">Only an admin can connect Pages.</p>}
        </div>
        <div className="card">
          <div className="h2">LinkedIn personal profile</div>
          <p className="mut mb-3 mt-1 text-xs">Each team member connects their own profile, so posts go out in their name.</p>
          {can(user, "editor") ? (
            li.configured("profile") ? <a className="btn btn-primary" href="/api/connect/linkedin/profile">Connect my LinkedIn profile</a>
              : <p className="text-xs text-warn">Add LINKEDIN_MEMBER_CLIENT_ID and LINKEDIN_MEMBER_CLIENT_SECRET in Vercel first (see README).</p>
          ) : <p className="mut text-xs">Viewers cannot connect accounts.</p>}
        </div>
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Account</th><th>Type</th><th>Status</th><th>Connection valid until</th><th></th></tr></thead>
          <tbody>
            {accounts.length === 0 && <tr><td colSpan={5} className="mut py-8 text-center">No accounts yet. Connect a LinkedIn Page or profile above.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                    <span className="font-medium">{a.name}</span>
                  </div>
                  {a.lastError && <div className="mt-1 max-w-md text-xs text-bad">{a.lastError}</div>}
                </td>
                <td className="capitalize">{a.platform} {a.kind}</td>
                <td><span className={`pill ${STATUS[a.status] ?? "bg-slate-100 text-mut"}`}>{a.status}</span></td>
                <td>
                  <span className={soon(a.tokenExpiresAt) ? "font-medium text-warn" : ""}>{fmtWhen(a.tokenExpiresAt, s.default_timezone) || "–"}</span>
                  <div className="mut text-xs">{a.refreshEnc ? "renews by itself" : soon(a.tokenExpiresAt) ? "reconnect soon" : ""}</div>
                </td>
                <td className="whitespace-nowrap text-right">
                  <span className="inline-flex flex-wrap justify-end gap-1.5">
                    {can(user, "editor") && <ActionButton action={testAccount.bind(null, a.id)}>Test</ActionButton>}
                    {can(user, a.kind === "page" ? "admin" : "editor") && <a className="btn btn-sm" href={`/api/connect/${a.platform}/${a.kind}`}>Reconnect</a>}
                    {can(user, "admin") && <ActionButton action={disconnectAccount.bind(null, a.id)} className="btn btn-sm btn-danger"
                      confirmText={`Disconnect ${a.name}? Its scheduled posts are cancelled.`}>Disconnect</ActionButton>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mut text-xs">LinkedIn redirect URL for both apps: <code className="rounded bg-slate-100 px-1">{appUrl()}/api/connect/linkedin/callback</code></p>
    </div>
  );
}
