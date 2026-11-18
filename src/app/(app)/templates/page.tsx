import { asc, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { TemplatesUI } from "./ui";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  await requirePage("editor");
  const d = db();
  const [templates, hashtagSets, linkSets, accounts] = await Promise.all([
    d.select().from(schema.templates).orderBy(asc(schema.templates.name)),
    d.select().from(schema.hashtagSets).orderBy(asc(schema.hashtagSets.name)),
    d.select().from(schema.linkSets).orderBy(asc(schema.linkSets.name)),
    d.select({ id: schema.socialAccounts.id, name: schema.socialAccounts.name, color: schema.socialAccounts.color })
      .from(schema.socialAccounts).where(ne(schema.socialAccounts.status, "disconnected")).orderBy(asc(schema.socialAccounts.name)),
  ]);
  return (
    <div>
      <h1 className="h1">Templates</h1>
      <p className="mut mb-5 mt-1">Reusable posts with <code className="rounded bg-slate-100 px-1">{"{{fields}}"}</code> you fill when composing, plus saved hashtag sets and link-tracking rules.</p>
      <TemplatesUI
        templates={templates.map(({ createdAt: _c, updatedAt: _u, createdBy: _b, ...t }) => t)}
        hashtagSets={hashtagSets.map(({ id, name, tags }) => ({ id, name, tags }))}
        linkSets={linkSets.map(({ createdAt: _c, ...l }) => l)}
        accounts={accounts}
      />
    </div>
  );
}
