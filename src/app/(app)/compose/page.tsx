import { asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ComposeForm } from "./form";
import { geminiOn } from "@/lib/gemini";

export const metadata = { title: "Compose" };

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ template?: string; from?: string; date?: string }> }) {
  await requirePage("editor");
  const sp = await searchParams;
  const d = db();
  const [accounts, templates, hashtagSets, linkSets, s, from] = await Promise.all([
    d.select({ id: schema.socialAccounts.id, name: schema.socialAccounts.name, kind: schema.socialAccounts.kind,
      platform: schema.socialAccounts.platform, color: schema.socialAccounts.color, status: schema.socialAccounts.status })
      .from(schema.socialAccounts).where(ne(schema.socialAccounts.status, "disconnected")).orderBy(asc(schema.socialAccounts.name)),
    d.select().from(schema.templates).orderBy(asc(schema.templates.name)),
    d.select().from(schema.hashtagSets).orderBy(asc(schema.hashtagSets.name)),
    d.select().from(schema.linkSets).orderBy(asc(schema.linkSets.name)),
    getSettings(),
    sp.from && /^\d+$/.test(sp.from)
      ? d.select().from(schema.posts).where(eq(schema.posts.id, Number(sp.from))).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const fromTargets = from ? await d.select({ accountId: schema.postTargets.accountId }).from(schema.postTargets).where(eq(schema.postTargets.postId, from.id)) : [];
  return (
    <div>
      <h1 className="h1 mb-1">Compose</h1>
      <p className="mut mb-5">Write a post (or start from a template), pick the accounts, then post now or schedule it.</p>
      <ComposeForm
        accounts={accounts}
        templates={templates.map((t) => ({ ...t, createdAt: undefined, updatedAt: undefined }))}
        hashtagSets={hashtagSets.map(({ id, name, tags }) => ({ id, name, tags }))}
        linkSets={linkSets.map(({ id, name, utmCampaign, track }) => ({ id, name, utmCampaign, track }))}
        defaultTz={s.default_timezone}
        approval={s.approval_required}
        geminiOn={geminiOn()}
        brandColor={s.brand_color}
        initialTemplateId={sp.template && /^\d+$/.test(sp.template) ? Number(sp.template) : undefined}
        initialDate={sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined}
        from={from ? { text: from.text, linkUrl: from.linkUrl, linkTitle: from.linkTitle, imageUrl: from.imageUrl,
          hashtagSetId: from.hashtagSetId, linkSetId: from.linkSetId, accountIds: fromTargets.map((t) => t.accountId) } : null}
      />
    </div>
  );
}
