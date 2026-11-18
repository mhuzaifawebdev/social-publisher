/** Template placeholders, hashtags and tracked links: pure functions, unit tested. */

const PH = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function placeholders(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(PH)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Fills {{name}}; unknown or empty names stay visible so the user notices them. */
export function fill(body: string, values: Record<string, string>): string {
  return body.replace(PH, (all, k: string) => (values[k] ? values[k] : all));
}

/** Normalises "#a, b #c" into "#a #b #c" (unique, keeps order). */
export function normaliseTags(tags: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags.split(/[\s,]+/)) {
    const w = t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (w && !seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); out.push("#" + w); }
  }
  return out.join(" ");
}

/** The final post text: body, then the hashtags not already in it. */
export function withHashtags(text: string, tags: string): string {
  const have = new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()));
  const add = normaliseTags(tags).split(" ").filter((t) => t && !have.has(t.toLowerCase()));
  return add.length ? `${text.trimEnd()}\n\n${add.join(" ")}` : text;
}

export function withUtm(url: string, utm: { source?: string; medium?: string; campaign?: string; content?: string }): string {
  try {
    const u = new URL(url);
    const set = (k: string, v?: string) => { if (v && !u.searchParams.has(k)) u.searchParams.set(k, v); };
    set("utm_source", utm.source);
    set("utm_medium", utm.medium);
    set("utm_campaign", utm.campaign);
    set("utm_content", utm.content);
    return u.toString();
  } catch { return url; }
}

export function isHttpUrl(s: string | null | undefined): boolean {
  if (!s) return false;
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

export const LIMITS: Record<string, number> = { linkedin: 3000 };
