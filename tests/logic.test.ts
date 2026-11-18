import { describe, expect, it } from "vitest";
import { liCommentary, liEscape, liExplain, liMonthBack, liPostBody, liVersions, linkedin } from "@/platforms/linkedin";
import { PlatformError } from "@/platforms/types";
import { buildRule, describeRule, nextOccurrence, parseRule } from "@/lib/recur";
import { utcToZoned, zonedToUtc } from "@/lib/time";
import { fill, normaliseTags, placeholders, withHashtags, withUtm } from "@/lib/compose";

describe("LinkedIn helpers", () => {
  it("escapes LinkedIn's reserved characters", () => {
    expect(liEscape("a (b) [c] @d *e_ ~f <g> |h {i}")).toBe("a \\(b\\) \\[c\\] \\@d \\*e\\_ \\~f \\<g\\> \\|h \\{i\\}");
  });
  it("keeps hashtags as hashtags", () => {
    expect(liCommentary("Hi (all) #Careers2026 and #intern")).toBe("Hi \\(all\\) {hashtag|\\#|Careers2026} and {hashtag|\\#|intern}");
  });
  it("builds an article post with thumbnail for a Page", () => {
    const b = liPostBody({ authorUrn: "urn:li:organization:106895244", text: "Join us", link: "https://x.io/a", linkTitle: "Role", imageUrn: "urn:li:image:1" }) as any;
    expect(b.author).toBe("urn:li:organization:106895244");
    expect(b.content.article).toEqual({ source: "https://x.io/a", title: "Role", thumbnail: "urn:li:image:1" });
    expect(b.lifecycleState).toBe("PUBLISHED");
  });
  it("builds an image post without a link, and a text-only post", () => {
    expect((liPostBody({ authorUrn: "urn:li:person:abc", text: "x", imageUrn: "urn:li:image:9" }) as any).content).toEqual({ media: { id: "urn:li:image:9" } });
    expect((liPostBody({ authorUrn: "urn:li:person:abc", text: "x" }) as any).content).toBeUndefined();
  });
  it("tries the saved version first, then the last five months", () => {
    expect(liMonthBack("202601", 2)).toBe("202511");
    expect(liVersions("202509", new Date(Date.UTC(2026, 10, 18)))).toEqual(["202509", "202610", "202609", "202608", "202607", "202606"]);
    expect(liVersions("", new Date(Date.UTC(2026, 0, 5)))[0]).toBe("202512");
  });
  it("explains errors and says whether to retry", () => {
    expect(liExplain(401, "").retry).toBe(false);
    expect(liExplain(429, "").retry).toBe(true);
    expect(liExplain(503, "").retry).toBe(true);
    expect(liExplain(422, "Content is a duplicate").message).toMatch(/duplicate/);
  });
});

describe("LinkedIn adapter with a fake LinkedIn", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let saved = "";
  const fake = (handler: (url: string, init: RequestInit) => Response) => linkedin({
    fetch: (async (url: string, init: RequestInit = {}) => { calls.push({ url, init }); return handler(url, init); }) as typeof fetch,
    clientId: () => "id", clientSecret: () => "secret", getVersion: async () => saved, saveVersion: async (v) => { saved = v; },
  });
  const acc = { id: 1, kind: "page" as const, urn: "urn:li:organization:5", externalId: "5", name: "PGI" };

  it("falls back to an older version when LinkedIn says the version is retired, and remembers the one that works", async () => {
    calls.length = 0; saved = "209901";
    const li = fake((_u, init) => {
      const v = (init.headers as Record<string, string>)["LinkedIn-Version"];
      if (v === "209901") return new Response('{"code":"VERSION_MISSING"}', { status: 426 });
      return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:77" } });
    });
    const r = await li.publish(acc, "tok", { text: "Hello" });
    expect(r).toEqual({ externalId: "urn:li:share:77", url: "https://www.linkedin.com/feed/update/urn:li:share:77/" });
    expect(calls.length).toBe(2);
    expect(saved).not.toBe("209901");
  });

  it("raises an auth error on 401 and a retryable error on 429", async () => {
    const li401 = fake(() => new Response("expired", { status: 401 }));
    await expect(li401.publish(acc, "tok", { text: "x" })).rejects.toMatchObject({ auth: true, retry: false });
    const li429 = fake(() => new Response("slow down", { status: 429 }));
    const e = await li429.publish(acc, "tok", { text: "x" }).catch((x) => x);
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.retry).toBe(true);
  });

  it("lists the Pages the person administers", async () => {
    const li = fake((u) => u.includes("organizationAcls")
      ? Response.json({ elements: [{ organization: "urn:li:organization:5" }, { organization: "urn:li:organization:9" }] })
      : Response.json({ results: { "5": { localizedName: "PGI" } } }));
    const o = await li.options("page", "tok");
    expect(o).toEqual([{ id: "5", urn: "urn:li:organization:5", name: "PGI", avatarUrl: null }, { id: "9", urn: "urn:li:organization:9", name: "LinkedIn Page 9", avatarUrl: null }]);
  });

  it("reads Page statistics in one call", async () => {
    const li = fake((u) => u.includes("organizationalEntityShareStatistics")
      ? Response.json({ elements: [{ share: "urn:li:share:1", totalShareStatistics: { impressionCount: 120, likeCount: 4, commentCount: 1, shareCount: 2, clickCount: 9 } }] })
      : new Response("", { status: 404 }));
    const r = await li.stats(acc, "tok", ["urn:li:share:1"]);
    expect(r.byId["urn:li:share:1"]).toMatchObject({ impressions: 120, reactions: 4, comments: 1, shares: 2, clicks: 9 });
  });
});

describe("timezones", () => {
  it("converts Malta wall time to UTC across daylight saving", () => {
    expect(zonedToUtc("2026-07-01", "10:00", "Europe/Malta").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "10:00", "Europe/Malta").toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(zonedToUtc("2026-11-18", "12:00", "Asia/Karachi").toISOString()).toBe("2026-11-18T07:00:00.000Z");
  });
  it("round-trips", () => {
    const d = zonedToUtc("2026-03-29", "09:30", "Europe/Malta");
    expect(utcToZoned(d, "Europe/Malta")).toMatchObject({ date: "2026-03-29", time: "09:30" });
  });
});

describe("repeat rules", () => {
  const tz = "Europe/Malta";
  it("parses and builds", () => {
    const s = buildRule({ freq: "WEEKLY", byDay: [4, 2], count: 6 });
    expect(s).toBe("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6");
    expect(parseRule(s)).toMatchObject({ freq: "WEEKLY", byDay: [2, 4], count: 6 });
    expect(describeRule(s)).toBe("Every week on Tue, Thu, 6 times");
    expect(parseRule("FREQ=HOURLY")).toBeNull();
  });
  it("weekly Tue/Thu: Tue -> Thu -> next Tue, same wall time across the DST change", () => {
    const tue = zonedToUtc("2026-10-20", "10:00", tz);
    const thu = nextOccurrence("FREQ=WEEKLY;BYDAY=TU,TH", tue, tz)!;
    expect(utcToZoned(thu, tz)).toMatchObject({ date: "2026-10-22", time: "10:00" });
    const nextTue = nextOccurrence("FREQ=WEEKLY;BYDAY=TU,TH", thu, tz)!;
    expect(utcToZoned(nextTue, tz)).toMatchObject({ date: "2026-10-27", time: "10:00" });   // after the clocks go back
  });
  it("every 2 weeks on Monday", () => {
    const mon = zonedToUtc("2026-11-16", "09:00", tz);
    expect(utcToZoned(nextOccurrence("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", mon, tz)!, tz).date).toBe("2026-11-30");
  });
  it("monthly keeps the day, clamped to month end", () => {
    const jan31 = zonedToUtc("2026-01-31", "09:00", tz);
    expect(utcToZoned(nextOccurrence("FREQ=MONTHLY", jan31, tz)!, tz).date).toBe("2026-02-28");
  });
  it("stops at UNTIL and COUNT", () => {
    const d = zonedToUtc("2026-11-18", "09:00", tz);
    expect(nextOccurrence("FREQ=DAILY;UNTIL=20261118", d, tz)).toBeNull();
    expect(nextOccurrence("FREQ=DAILY;COUNT=3", d, tz, 3)).toBeNull();
    expect(nextOccurrence("FREQ=DAILY;COUNT=3", d, tz, 2)).not.toBeNull();
  });
});

describe("templates, hashtags and links", () => {
  it("finds and fills placeholders, leaving empty ones visible", () => {
    const t = "New role: {{job_title}} in {{ city }}. {{job_title}}!";
    expect(placeholders(t)).toEqual(["job_title", "city"]);
    expect(fill(t, { job_title: "Designer", city: "" })).toBe("New role: Designer in {{ city }}. Designer!");
  });
  it("normalises hashtag sets and does not repeat tags already in the text", () => {
    expect(normaliseTags("#a, b  #A #c-d")).toBe("#a #b #cd");
    expect(withHashtags("Hello #b", "#a #b")).toBe("Hello #b\n\n#a");
    expect(withHashtags("Hello", "")).toBe("Hello");
  });
  it("adds UTM tags without overwriting existing ones", () => {
    expect(withUtm("https://x.io/p?utm_source=mail", { source: "linkedin", medium: "social", campaign: "c1" }))
      .toBe("https://x.io/p?utm_source=mail&utm_medium=social&utm_campaign=c1");
    expect(withUtm("not a url", { source: "x" })).toBe("not a url");
  });
});
