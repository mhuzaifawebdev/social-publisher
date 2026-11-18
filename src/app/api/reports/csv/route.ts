import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireRole, AuthError } from "@/lib/auth";

export const runtime = "nodejs";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;            // no spreadsheet formulas
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every published post of the period with its latest numbers, as CSV. */
export async function GET(req: Request) {
  try { await requireRole("viewer"); } catch (e) { if (e instanceof AuthError) return new NextResponse("Sign in first.", { status: 401 }); throw e; }
  const u = new URL(req.url);
  const days = [7, 30, 90].includes(Number(u.searchParams.get("d"))) ? Number(u.searchParams.get("d")) : 30;
  const account = Number(u.searchParams.get("account")) || 0;
  const r = await db().execute(sql`
    select t.published_at, a.name account, a.kind, p.text, t.url, s.impressions, s.reactions, s.comments, s.shares, s.clicks linkedin_clicks,
      coalesce(c.n,0)::int link_clicks, tp.name template
    from post_targets t join posts p on p.id = t.post_id join social_accounts a on a.id = t.account_id
    left join templates tp on tp.id = p.template_id
    left join lateral (select impressions, reactions, comments, shares, clicks from post_stats where target_id = t.id order by at desc limit 1) s on true
    left join lateral (select count(*)::int n from link_clicks where target_id = t.id) c on true
    where t.status = 'published' and t.published_at > now() - make_interval(days => ${days}) ${account ? sql`and t.account_id = ${account}` : sql``}
    order by t.published_at desc`);
  const cols = ["published_at", "account", "kind", "template", "text", "url", "impressions", "reactions", "comments", "shares", "linkedin_clicks", "link_clicks"];
  const lines = [cols.join(","), ...(r.rows as Record<string, unknown>[]).map((row) => cols.map((c) => cell(row[c])).join(","))];
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="social-report-${days}d.csv"`, "Cache-Control": "no-store" },
  });
}
