"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { normaliseTags, isHttpUrl } from "@/lib/compose";
import { parseRule } from "@/lib/recur";
import { setSetting } from "@/lib/settings";
import { TIMEZONES } from "@/lib/time";
import { platform } from "@/platforms";
import { accountToken, markAccount, ref } from "@/server/accounts";
import { saveAccounts } from "@/server/connect";
import { PostInput, cancelPost, decide, reschedule, savePost, type SaveResult } from "@/server/posts";
import { retryTarget } from "@/server/publish";
import { refreshStats, rollup } from "@/server/sweep";
import { aiPicture, cardCopy, underCap, writePosts } from "@/server/ai";
import { renderCard, type CardInput } from "@/server/card";
import { storeImage } from "@/server/images";
import { getSettings } from "@/lib/settings";

type R = { ok: boolean; message: string };
const fail = (e: unknown): R => ({ ok: false, message: (e as Error)?.message || "Something went wrong." });

/* ------------------------------ accounts ------------------------------ */

export async function testAccount(id: number): Promise<R> {
  try {
    await requireRole("editor");
    const [a] = await db().select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, id));
    if (!a) return { ok: false, message: "Account not found." };
    const r = await platform(a.platform).check(ref(a), await accountToken(a));
    await markAccount(a.id, r.ok ? "active" : "error", r.ok ? null : r.note);
    return { ok: r.ok, message: r.note };
  } catch (e) { return fail(e); }
}

export async function disconnectAccount(id: number): Promise<R> {
  try {
    const u = await requireRole("admin");
    await db().update(schema.socialAccounts).set({ status: "disconnected", updatedAt: new Date() }).where(eq(schema.socialAccounts.id, id));
    await db().update(schema.postTargets).set({ status: "cancelled", error: "Account disconnected.", updatedAt: new Date() })
      .where(and(eq(schema.postTargets.accountId, id), sql`${schema.postTargets.status} in ('held','scheduled')`));
    await audit(u.id, "account.disconnected", `#${id}`);
    revalidatePath("/accounts");
    return { ok: true, message: "Disconnected. Its scheduled posts were cancelled." };
  } catch (e) { return fail(e); }
}

export async function setAccountColor(id: number, color: string): Promise<R> {
  try {
    await requireRole("admin");
    if (!/^#[0-9a-f]{6}$/i.test(color)) return { ok: false, message: "Pick a colour." };
    await db().update(schema.socialAccounts).set({ color }).where(eq(schema.socialAccounts.id, id));
    revalidatePath("/accounts");
    return { ok: true, message: "Saved." };
  } catch (e) { return fail(e); }
}

/** After a Page admin signs in: add the Pages they ticked. */
export async function chooseAccounts(sessionId: string, form: FormData) {
  const u = await requireRole("admin");
  const d = db();
  const [s] = await d.select().from(schema.connectSessions).where(and(eq(schema.connectSessions.id, sessionId), eq(schema.connectSessions.userId, u.id)));
  if (!s || Date.now() - s.createdAt.getTime() > 30 * 60_000) redirect("/accounts?error=" + encodeURIComponent("This choice expired. Press Connect again."));
  const ids = form.getAll("org").map(String);
  const chosen = s.options.filter((o) => ids.includes(o.id));
  if (chosen.length) {
    await saveAccounts(u.id, s.platform, s.kind as "page", {
      accessToken: decrypt(s.tokenEnc), refreshToken: s.refreshEnc ? decrypt(s.refreshEnc) : null,
      expiresAt: s.tokenExpiresAt, refreshExpiresAt: s.refreshExpiresAt, scopes: s.scopes ?? "",
    }, chosen);
    await audit(u.id, "account.connected", `${s.platform} pages: ${chosen.map((c) => c.name).join(", ")}`);
  }
  await d.delete(schema.connectSessions).where(eq(schema.connectSessions.id, sessionId));
  redirect(`/accounts?ok=${encodeURIComponent(chosen.length ? `${chosen.length} Page(s) connected.` : "Nothing was added.")}`);
}

/* ------------------------------ posts ------------------------------ */

export async function savePostAction(raw: unknown): Promise<SaveResult> {
  try {
    const u = await requireRole("editor");
    const parsed = PostInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Check the form." };
    if (!TIMEZONES.includes(parsed.data.timezone)) return { ok: false, error: "Pick a timezone from the list." };
    const r = await savePost(parsed.data, u);
    revalidatePath("/", "layout");
    return r;
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function decideAction(postId: number, approve: boolean): Promise<R> {
  try { const u = await requireRole("admin"); const m = await decide(postId, approve, u); revalidatePath("/", "layout"); return { ok: !/no longer/.test(m), message: m }; }
  catch (e) { return fail(e); }
}

export async function cancelAction(postId: number): Promise<R> {
  try { const u = await requireRole("editor"); await cancelPost(postId, u); revalidatePath("/", "layout"); return { ok: true, message: "Cancelled." }; }
  catch (e) { return fail(e); }
}

export async function retryAction(targetId: number): Promise<R> {
  try {
    await requireRole("editor");
    const r = await retryTarget(targetId);
    revalidatePath("/", "layout");
    if (!r) return { ok: false, message: "Only failed posts can be retried." };
    return { ok: r.status === "published", message: r.status === "published" ? "Published." : r.message || r.status };
  } catch (e) { return fail(e); }
}

export async function rescheduleAction(postId: number, iso: string): Promise<R> {
  try {
    const u = await requireRole("editor");
    const m = await reschedule(postId, new Date(iso), u);
    revalidatePath("/calendar");
    return { ok: m === "Moved.", message: m };
  } catch (e) { return fail(e); }
}

export async function refreshStatsAction(): Promise<R> {
  try {
    await requireRole("editor");
    const notes: string[] = [];
    const n = await refreshStats(40_000, notes, true);
    await rollup();
    revalidatePath("/reports"); revalidatePath("/");
    return { ok: true, message: `Updated ${n} post${n === 1 ? "" : "s"}.${notes.length ? " " + notes.slice(0, 2).join(" ") : ""}` };
  } catch (e) { return fail(e); }
}

/* ------------------------------ templates, hashtag and link sets ------------------------------ */

const TemplateIn = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().trim().min(1, "Give the template a name.").max(120),
  body: z.string().trim().min(1, "Write the template text.").max(5000),
  imageUrl: z.string().trim().optional().default(""),
  linkUrl: z.string().trim().optional().default(""),
  hashtagSetId: z.coerce.number().int().optional(),
  linkSetId: z.coerce.number().int().optional(),
  accountIds: z.array(z.coerce.number().int()).default([]),
  rrule: z.string().optional().default(""),
  time: z.string().optional().default(""),
});

export async function saveTemplate(raw: unknown): Promise<R> {
  try {
    const u = await requireRole("editor");
    const p = TemplateIn.safeParse(raw);
    if (!p.success) return { ok: false, message: p.error.issues[0]?.message || "Check the form." };
    const t = p.data;
    if (t.linkUrl && !isHttpUrl(t.linkUrl)) return { ok: false, message: "The link must start with https://" };
    if (t.rrule && !parseRule(t.rrule)) return { ok: false, message: "The repeat rule is not valid." };
    const vals = { name: t.name, body: t.body, imageUrl: t.imageUrl || null, linkUrl: t.linkUrl || null,
      hashtagSetId: t.hashtagSetId || null, linkSetId: t.linkSetId || null, accountIds: t.accountIds, rrule: t.rrule || null,
      time: /^\d{2}:\d{2}$/.test(t.time) ? t.time : null, updatedAt: new Date() };
    if (t.id) await db().update(schema.templates).set(vals).where(eq(schema.templates.id, t.id));
    else await db().insert(schema.templates).values({ ...vals, createdBy: u.id });
    await audit(u.id, t.id ? "template.updated" : "template.created", t.name);
    revalidatePath("/templates"); revalidatePath("/compose");
    return { ok: true, message: "Template saved." };
  } catch (e) { return fail(e); }
}

export async function deleteTemplate(id: number): Promise<R> {
  try { const u = await requireRole("editor"); await db().delete(schema.templates).where(eq(schema.templates.id, id)); await audit(u.id, "template.deleted", `#${id}`); revalidatePath("/templates"); return { ok: true, message: "Deleted." }; }
  catch (e) { return fail(e); }
}

export async function saveHashtagSet(raw: { id?: number; name: string; tags: string }): Promise<R> {
  try {
    await requireRole("editor");
    const name = String(raw.name || "").trim(), tags = normaliseTags(String(raw.tags || ""));
    if (!name || !tags) return { ok: false, message: "Give the set a name and at least one hashtag." };
    if (raw.id) await db().update(schema.hashtagSets).set({ name, tags }).where(eq(schema.hashtagSets.id, raw.id));
    else await db().insert(schema.hashtagSets).values({ name, tags });
    revalidatePath("/templates");
    return { ok: true, message: "Saved." };
  } catch (e) { return fail(e); }
}

export async function deleteHashtagSet(id: number): Promise<R> {
  try { await requireRole("editor"); await db().delete(schema.hashtagSets).where(eq(schema.hashtagSets.id, id)); revalidatePath("/templates"); return { ok: true, message: "Deleted." }; }
  catch (e) { return fail(e); }
}

export async function saveLinkSet(raw: { id?: number; name: string; utmSource: string; utmMedium: string; utmCampaign: string; track: boolean }): Promise<R> {
  try {
    await requireRole("editor");
    const clean = (s: string) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").slice(0, 60);
    const name = String(raw.name || "").trim();
    if (!name) return { ok: false, message: "Give the link set a name." };
    const vals = { name, utmSource: clean(raw.utmSource) || "linkedin", utmMedium: clean(raw.utmMedium) || "social", utmCampaign: clean(raw.utmCampaign), track: !!raw.track };
    if (raw.id) await db().update(schema.linkSets).set(vals).where(eq(schema.linkSets.id, raw.id));
    else await db().insert(schema.linkSets).values(vals);
    revalidatePath("/templates");
    return { ok: true, message: "Saved." };
  } catch (e) { return fail(e); }
}

export async function deleteLinkSet(id: number): Promise<R> {
  try { await requireRole("editor"); await db().delete(schema.linkSets).where(eq(schema.linkSets.id, id)); revalidatePath("/templates"); return { ok: true, message: "Deleted." }; }
  catch (e) { return fail(e); }
}

/* ------------------------------ team and settings ------------------------------ */

const UserIn = z.object({
  name: z.string().trim().min(1, "Enter the name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["admin", "editor", "viewer"]),
  password: z.string().min(10, "The password needs at least 10 characters."),
});

export async function addUser(raw: unknown): Promise<R> {
  try {
    const me = await requireRole("admin");
    const p = UserIn.safeParse(raw);
    if (!p.success) return { ok: false, message: p.error.issues[0]?.message || "Check the form." };
    const [u] = await db().insert(schema.users).values({ name: p.data.name, email: p.data.email, role: p.data.role,
      passwordHash: await hashPassword(p.data.password) }).onConflictDoNothing().returning();
    if (!u) return { ok: false, message: "A user with this email already exists." };
    await audit(me.id, "user.added", `${p.data.email} as ${p.data.role}`);
    revalidatePath("/team");
    return { ok: true, message: `${p.data.name} added. Share the password with them privately.` };
  } catch (e) { return fail(e); }
}

export async function updateUser(id: number, patch: { role?: "admin" | "editor" | "viewer"; active?: boolean; password?: string }): Promise<R> {
  try {
    const me = await requireRole("admin");
    if (id === me.id && (patch.role && patch.role !== "admin" || patch.active === false)) return { ok: false, message: "You cannot remove your own admin access." };
    const set: Partial<typeof schema.users.$inferInsert> = {};
    if (patch.role) set.role = patch.role;
    if (patch.active !== undefined) set.active = patch.active;
    if (patch.password) {
      if (patch.password.length < 10) return { ok: false, message: "The password needs at least 10 characters." };
      set.passwordHash = await hashPassword(patch.password);
    }
    if (set.role && set.role !== "admin" || set.active === false) {
      const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.users)
        .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true), ne(schema.users.id, id)));
      if (!n) return { ok: false, message: "Keep at least one active admin." };
    }
    await db().update(schema.users).set(set).where(eq(schema.users.id, id));
    await audit(me.id, "user.updated", `#${id} ${Object.keys(set).join(", ")}`);
    revalidatePath("/team");
    return { ok: true, message: "Saved. Role changes apply at their next sign-in." };
  } catch (e) { return fail(e); }
}

export async function saveSettings(raw: { approval_required: boolean; default_timezone: string; brand_name: string; brand_color: string }): Promise<R> {
  try {
    const me = await requireRole("admin");
    if (!TIMEZONES.includes(raw.default_timezone)) return { ok: false, message: "Pick a timezone from the list." };
    await setSetting("approval_required", !!raw.approval_required);
    await setSetting("default_timezone", raw.default_timezone);
    await setSetting("brand_name", String(raw.brand_name || "").trim().slice(0, 80));
    if (/^#[0-9a-f]{6}$/i.test(raw.brand_color)) await setSetting("brand_color", raw.brand_color);
    await audit(me.id, "settings.saved", JSON.stringify(raw));
    revalidatePath("/team");
    return { ok: true, message: "Settings saved." };
  } catch (e) { return fail(e); }
}

/* ------------------------------ AI assist (Gemini) ------------------------------ */

type AiR<T> = ({ ok: true } & T) | { ok: false; message: string };
const aiFail = (e: unknown) => ({ ok: false as const, message: (e as Error)?.message || "The AI step failed." });

export async function aiWriteAction(raw: { context: string; tone: string; length: "short" | "medium" | "long"; audience: string;
  kind: "page" | "profile" | "mixed"; link?: string }): Promise<AiR<{ variants: string[]; hashtags: string }>> {
  try {
    const u = await requireRole("editor");
    if (String(raw.context || "").trim().length < 10) return { ok: false, message: "Describe what the post is about (a sentence or two at least)." };
    await underCap(u.id, "ai.write");
    const s = await getSettings();
    const r = await writePosts({ ...raw, length: ["short", "medium", "long"].includes(raw.length) ? raw.length : "medium", brand: s.brand_name });
    await audit(u.id, "ai.write", raw.context.slice(0, 120));
    return { ok: true, ...r };
  } catch (e) { return aiFail(e); }
}

export async function aiCardCopyAction(context: string): Promise<AiR<{ headline: string; sub: string; kicker: string }>> {
  try {
    const u = await requireRole("editor");
    if (String(context || "").trim().length < 10) return { ok: false, message: "Write the post text or the context first." };
    await underCap(u.id, "ai.write");
    const r = await cardCopy(context, (await getSettings()).brand_name);
    await audit(u.id, "ai.write", "card text");
    return { ok: true, ...r };
  } catch (e) { return aiFail(e); }
}

export async function aiCardAction(raw: Omit<CardInput, "brand" | "color"> & { color?: string }): Promise<AiR<{ url: string }>> {
  try {
    const u = await requireRole("editor");
    if (!String(raw.headline || "").trim()) return { ok: false, message: "Write a headline for the card." };
    await underCap(u.id, "ai.card");
    const s = await getSettings();
    const png = await renderCard({ headline: raw.headline.trim(), sub: raw.sub?.trim(), kicker: raw.kicker?.trim(), brand: s.brand_name || "Our team",
      color: raw.color && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : s.brand_color,
      style: ["bold", "light", "dark"].includes(raw.style) ? raw.style : "bold", format: ["landscape", "square", "portrait"].includes(raw.format) ? raw.format : "landscape" });
    const url = await storeImage(png, "cards");
    await audit(u.id, "ai.card", raw.headline.slice(0, 80));
    return { ok: true, url };
  } catch (e) { return aiFail(e); }
}

export async function aiImageAction(raw: { context: string; style: string; aspect: string }): Promise<AiR<{ url: string }>> {
  try {
    const u = await requireRole("editor");
    if (String(raw.context || "").trim().length < 10) return { ok: false, message: "Describe the picture (or write the post first)." };
    await underCap(u.id, "ai.image");
    const aspect = ["1:1", "4:5", "16:9"].includes(raw.aspect) ? raw.aspect : "1:1";
    const img = await aiPicture(raw.context, (await getSettings()).brand_name, raw.style, aspect);
    const url = await storeImage(img.bytes, "ai");
    await audit(u.id, "ai.image", raw.context.slice(0, 120));
    return { ok: true, url };
  } catch (e) { return aiFail(e); }
}
