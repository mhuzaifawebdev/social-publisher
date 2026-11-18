import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtWhen } from "@/lib/time";
import { queueOn } from "@/server/queue";
import { envOr } from "@/lib/env";
import { TeamUI } from "./ui";
import { liPageId, liPageSecret } from "@/platforms";

export const metadata = { title: "Team & settings" };

export default async function TeamPage() {
  const me = await requirePage("admin");
  const d = db();
  const [users, s, log] = await Promise.all([
    d.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, active: schema.users.active, lastLoginAt: schema.users.lastLoginAt })
      .from(schema.users).orderBy(asc(schema.users.name)),
    getSettings(),
    d.select({ at: schema.auditLog.at, action: schema.auditLog.action, detail: schema.auditLog.detail, name: schema.users.name })
      .from(schema.auditLog).leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId)).orderBy(desc(schema.auditLog.at)).limit(30),
  ]);
  const checks = [
    ["Database", true],
    ["Exact-time publishing (QStash)", queueOn()],
    ["Image uploads (Vercel Blob)", !!envOr("BLOB_READ_WRITE_TOKEN")],
    ["Background check (CRON_SECRET)", !!envOr("CRON_SECRET")],
    ["LinkedIn Pages app", !!liPageId() && !!liPageSecret()],
    ["LinkedIn profiles app", !!envOr("LINKEDIN_MEMBER_CLIENT_ID") && !!envOr("LINKEDIN_MEMBER_CLIENT_SECRET")],
    ["AI assist (GEMINI_API_KEY)", !!envOr("GEMINI_API_KEY")],
  ] as const;
  return (
    <div className="space-y-5">
      <div><h1 className="h1">Team & settings</h1><p className="mut mt-1">Who can use the tool, what they may do, and how posting works.</p></div>
      <TeamUI meId={me.id} users={users.map((u) => ({ ...u, lastLoginAt: fmtWhen(u.lastLoginAt, s.default_timezone) }))}
        settings={{ approval_required: s.approval_required, default_timezone: s.default_timezone, brand_name: s.brand_name, brand_color: s.brand_color }} />
      <section className="card">
        <h2 className="h2 mb-2">Setup check</h2>
        <ul className="grid gap-1 text-[13px] sm:grid-cols-2">
          {checks.map(([l, ok]) => <li key={l} className="flex items-center gap-2"><span className={`pill ${ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{ok ? "✓ set" : "missing"}</span>{l}</li>)}
        </ul>
        {!queueOn() && <p className="mut mt-2 text-xs">Without QStash, scheduled posts go out at the next 10-minute background check instead of the exact minute.</p>}
      </section>
      <section className="card overflow-x-auto p-0">
        <h2 className="h2 px-4 pt-4">Activity</h2>
        <table className="tbl mt-2"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead><tbody>
          {log.map((l, i) => <tr key={i}><td className="whitespace-nowrap">{fmtWhen(l.at, s.default_timezone)}</td><td>{l.name ?? "system"}</td><td>{l.action}</td><td className="mut max-w-md truncate">{l.detail}</td></tr>)}
        </tbody></table>
      </section>
    </div>
  );
}
