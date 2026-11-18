import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { geminiImage, geminiJson, AiError } from "@/lib/gemini";
import { normaliseTags } from "@/lib/compose";

/** Per-person daily caps keep a key's quota (and any bill) under control. */
export const CAPS = { "ai.write": 150, "ai.card": 100, "ai.image": 20 } as const;

export async function underCap(userId: number, action: keyof typeof CAPS) {
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.auditLog)
    .where(and(eq(schema.auditLog.userId, userId), eq(schema.auditLog.action, action), gt(schema.auditLog.at, new Date(Date.now() - 864e5))));
  if (n >= CAPS[action]) throw new AiError(`Daily limit reached (${CAPS[action]} per person for this AI action). It resets within 24 hours.`);
}

const clean = (s: string, max: number) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

export type WriteInput = { context: string; tone: string; length: "short" | "medium" | "long"; audience: string; kind: "page" | "profile" | "mixed";
  brand: string; link?: string };

const LEN = { short: "40-70 words", medium: "80-140 words", long: "150-230 words" };

/** Three different LinkedIn posts from the user's context, plus hashtags. */
export async function writePosts(i: WriteInput): Promise<{ variants: string[]; hashtags: string }> {
  const prompt = [
    `You write LinkedIn posts for ${clean(i.brand, 80) || "a company"}.`,
    i.kind === "profile" ? "Write in the first person, as a professional sharing on their own profile." : "Write as the company Page (we/our).",
    `Tone: ${clean(i.tone, 40) || "professional and warm"}. Length: ${LEN[i.length]} each.`,
    i.audience ? `Audience: ${clean(i.audience, 120)}.` : "",
    "Rules: a strong first line (it is all people see before 'see more'); short paragraphs with blank lines between them;",
    "plain words; at most 2 emojis; one clear call to action at the end; no hashtags in the text; never invent facts, numbers, dates or names",
    "that are not in the context; if a link is given, refer to it as 'the link' (it is attached as a card).",
    "Make the three versions clearly different: 1) story or hook, 2) straight and informative, 3) question or list.",
    "Also give 3-5 relevant hashtags (single words, no spaces).",
    i.link ? `Link being shared: ${clean(i.link, 300)}` : "",
    "", "Context from the user:", clean(i.context, 4000),
  ].filter(Boolean).join("\n");
  const r = await geminiJson<{ variants: string[]; hashtags: string[] }>(prompt, {
    type: "OBJECT", required: ["variants", "hashtags"],
    properties: { variants: { type: "ARRAY", items: { type: "STRING" } }, hashtags: { type: "ARRAY", items: { type: "STRING" } } },
  });
  const variants = (r.variants ?? []).map((v) => String(v).replace(/\n{3,}/g, "\n\n").trim()).filter(Boolean).slice(0, 3);
  if (!variants.length) throw new AiError("Gemini returned no post. Add more context and try again.");
  return { variants, hashtags: normaliseTags((r.hashtags ?? []).join(" ")) };
}

/** Headline, sub-line and label for a branded card. */
export async function cardCopy(context: string, brand: string): Promise<{ headline: string; sub: string; kicker: string }> {
  const r = await geminiJson<{ headline: string; sub: string; kicker: string }>([
    `Write the text for a social media graphic for ${clean(brand, 80) || "a company"}.`,
    "headline: max 8 words, punchy, no ending period. sub: one supporting line, max 14 words. kicker: a 1-3 word label in",
    "capitals such as WE'RE HIRING, NEW PROGRAMME, EVENT, TIP. Use only facts from the context.",
    "", "Context:", clean(context, 3000),
  ].join("\n"), {
    type: "OBJECT", required: ["headline", "sub", "kicker"],
    properties: { headline: { type: "STRING" }, sub: { type: "STRING" }, kicker: { type: "STRING" } },
  }, 0.7);
  return { headline: clean(r.headline, 110), sub: clean(r.sub, 160), kicker: clean(r.kicker, 40).toUpperCase() };
}

/** An AI picture: a clean, professional image with no text in it (text in AI images is often misspelt). */
export async function aiPicture(context: string, brand: string, style: string, aspect: string) {
  const styles: Record<string, string> = {
    photo: "a natural, high-quality editorial photograph, soft daylight, shallow depth of field",
    illustration: "a modern flat vector illustration, clean shapes, soft gradients",
    abstract: "an abstract, elegant background of shapes and light, suitable behind a headline",
    "3d": "a polished 3D render, soft studio lighting, pastel tones",
  };
  const prompt = [
    `Create ${styles[style] ?? styles.photo} for a LinkedIn post by ${clean(brand, 80) || "a company"}.`,
    `Subject, from the post: ${clean(context, 1200)}`,
    "Professional, inclusive and optimistic; uncluttered composition with space around the subject.",
    "Do NOT include any text, letters, words, numbers, logos or watermarks in the image.",
  ].join("\n");
  return geminiImage(prompt, aspect);
}
