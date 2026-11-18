/**
 * LinkedIn adapter (official REST API). Ported from the working HR tool code (hr_tool/apps_script/LinkedIn.gs and
 * LinkedInMonitor.gs) and extended to many accounts: company Pages and personal profiles.
 *
 * LinkedIn needs two apps, because the Community Management API must be the only product on its app:
 *   page    = the approved "Community Management API" app  (w_organization_social r_organization_social rw_organization_admin)
 *   profile = a second app with "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" (openid profile w_member_social)
 * Pure helpers (body, escaping, versions, errors) take no I/O, so they are unit tested in tests/linkedin.test.ts.
 */
import type { AccountKind, ConnectOption, PlatformAdapter, PublishInput, PublishResult, StatsResult, TokenSet } from "./types";
import { PlatformError } from "./types";

export const LI_REST = "https://api.linkedin.com/rest";
export const SCOPES: Record<AccountKind, string> = {
  page: "w_organization_social r_organization_social rw_organization_admin",
  profile: "openid profile w_member_social",
};

/* ------------------------------------ pure helpers ------------------------------------ */

/** LinkedIn's "little text" format: these characters must be escaped with a backslash in post text. */
export function liEscape(text: string): string {
  return String(text || "").replace(/[\\|{}@\[\]()<>#*_~]/g, (ch) => "\\" + ch);
}

/** Keeps hashtags clickable: "#word" becomes LinkedIn's hashtag markup instead of an escaped "\#word". */
export function liCommentary(text: string): string {
  const parts = String(text || "").split(/(#[\p{L}\p{N}_]+)/u);
  return parts.map((p, i) => (i % 2 ? `{hashtag|\\#|${p.slice(1)}}` : liEscape(p))).join("");
}

export function liPostBody(p: { authorUrn: string; text: string; link?: string | null; linkTitle?: string | null;
  linkDescription?: string | null; imageUrn?: string | null }) {
  const body: Record<string, unknown> = {
    author: p.authorUrn,
    commentary: liCommentary(p.text).slice(0, 2990),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (p.link) {
    const article: Record<string, string> = { source: p.link, title: String(p.linkTitle || p.link).slice(0, 200) };
    if (p.linkDescription) article.description = p.linkDescription.slice(0, 250);
    if (p.imageUrn) article.thumbnail = p.imageUrn;
    body.content = { article };
  } else if (p.imageUrn) {
    body.content = { media: { id: p.imageUrn } };
  }
  return body;
}

export function liMonthBack(yyyymm: string, n: number): string {
  let y = Number(yyyymm.slice(0, 4)), m = Number(yyyymm.slice(4, 6)) - n;
  while (m < 1) { m += 12; y--; }
  return `${y}${m < 10 ? "0" : ""}${m}`;
}

/** LinkedIn-Version headers to try: the last one that worked, then the last five months (versions retire after ~1 year). */
export function liVersions(saved: string, now = new Date()): string[] {
  const out: string[] = [];
  const add = (x: string) => { x = String(x || "").replace(/\D/g, ""); if (/^\d{6}$/.test(x) && !out.includes(x)) out.push(x); };
  add(saved);
  const cur = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const n of [1, 2, 3, 4, 5]) add(liMonthBack(cur, n));
  return out;
}

export function liPostUrl(urn: string): string { return `https://www.linkedin.com/feed/update/${urn}/`; }

/** LinkedIn's error answer in plain words, and whether trying again later can help. */
export function liExplain(code: number, body: string): { message: string; retry: boolean } {
  const b = String(body || "").slice(0, 200);
  if (code === 401) return { message: "The LinkedIn connection expired or was removed. Reconnect the account on the Accounts page.", retry: false };
  if (code === 403) return { message: `LinkedIn refused: the person who connected must be an admin of the Page (or the profile owner), and the app needs the right product. (${b})`, retry: false };
  if (code === 422 && /duplicate/i.test(b)) return { message: "LinkedIn refused a duplicate: the same text was already posted on this account.", retry: false };
  if (code === 429) return { message: "LinkedIn's daily limit for this app is reached; it is tried again later.", retry: true };
  if (code >= 500) return { message: `LinkedIn had a problem (${code}); it is tried again.`, retry: true };
  return { message: `LinkedIn answered ${code}: ${b}`, retry: false };
}

/* ------------------------------------ I/O ------------------------------------ */

type Fetch = typeof fetch;
export type LinkedInDeps = {
  fetch?: Fetch;
  clientId: (k: AccountKind) => string;
  clientSecret: (k: AccountKind) => string;
  getVersion: () => Promise<string>;
  saveVersion: (v: string) => Promise<void>;
};

export function linkedin(deps: LinkedInDeps): PlatformAdapter {
  const f: Fetch = deps.fetch ?? fetch;

  async function rest(path: string, token: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : LI_REST + path;
    const saved = await deps.getVersion();
    let res: Response | null = null;
    for (const ver of liVersions(saved)) {
      res = await f(url, { ...init, headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": ver,
        "X-Restli-Protocol-Version": "2.0.0", ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers as Record<string, string> | undefined) } });
      if ((res.status === 426 || res.status === 400) && /VERSION/i.test(await res.clone().text())) continue;
      if (res.status < 300 && ver !== saved) await deps.saveVersion(ver);
      return res;
    }
    return res!;
  }

  async function tokenCall(kind: AccountKind, form: Record<string, string>): Promise<TokenSet> {
    const res = await f("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...form, client_id: deps.clientId(kind), client_secret: deps.clientSecret(kind) }),
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !d.access_token) {
      throw new PlatformError(`LinkedIn refused the sign-in: ${String(d.error_description || d.error || res.status).slice(0, 200)}`, false);
    }
    const now = Date.now();
    return {
      accessToken: String(d.access_token),
      expiresAt: new Date(now + (Number(d.expires_in) || 5_184_000) * 1000),
      refreshToken: d.refresh_token ? String(d.refresh_token) : null,
      refreshExpiresAt: d.refresh_token ? new Date(now + (Number(d.refresh_token_expires_in) || 31_536_000) * 1000) : null,
      scopes: d.scope ? String(d.scope) : SCOPES[kind],
    };
  }

  return {
    id: "linkedin",
    label: "LinkedIn",
    kinds: ["page", "profile"],

    configured(kind) { return !!deps.clientId(kind) && !!deps.clientSecret(kind); },

    connectUrl(kind, state, redirectUri) {
      return "https://www.linkedin.com/oauth/v2/authorization?" + new URLSearchParams({
        response_type: "code", client_id: deps.clientId(kind), redirect_uri: redirectUri, state, scope: SCOPES[kind],
      }).toString();
    },

    exchange(kind, code, redirectUri) {
      return tokenCall(kind, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
    },

    refresh(kind, refreshToken) { return tokenCall(kind, { grant_type: "refresh_token", refresh_token: refreshToken }); },

    /** Pages: every Page the signed-in person administers. Profiles: the person themself. */
    async options(kind, token): Promise<ConnectOption[]> {
      if (kind === "profile") {
        const r = await f("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new PlatformError(liExplain(r.status, await r.text()).message, false);
        const u = (await r.json()) as { sub: string; name?: string; picture?: string };
        return [{ id: u.sub, urn: `urn:li:person:${u.sub}`, name: u.name || "LinkedIn profile", avatarUrl: u.picture ?? null }];
      }
      const acl = await rest("/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100", token);
      if (!acl.ok) throw new PlatformError(liExplain(acl.status, await acl.text()).message, false);
      const urns = ((await acl.json()) as { elements?: { organization?: string }[] }).elements
        ?.map((e) => e.organization).filter((x): x is string => !!x) ?? [];
      if (!urns.length) return [];
      const ids = urns.map((u) => u.split(":").pop()!);
      const names: Record<string, string> = {};
      const org = await rest(`/organizations?ids=List(${ids.join(",")})`, token);
      if (org.ok) {
        const d = (await org.json()) as { results?: Record<string, { localizedName?: string }> };
        for (const [k, v] of Object.entries(d.results ?? {})) names[k] = v.localizedName ?? "";
      }
      return ids.map((id) => ({ id, urn: `urn:li:organization:${id}`, name: names[id] || `LinkedIn Page ${id}`, avatarUrl: null }));
    },

    async check(account, token) {
      if (account.kind === "profile") {
        const r = await f("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
        return r.ok ? { ok: true, note: "LinkedIn accepts this profile's connection: posting will work." }
          : { ok: false, note: liExplain(r.status, await r.text()).message };
      }
      const r = await rest(`/posts?q=author&count=1&author=${encodeURIComponent(account.urn)}`, token);
      return r.ok ? { ok: true, note: `LinkedIn accepts the connection for ${account.name}: posting will work.` }
        : { ok: false, note: liExplain(r.status, await r.text()).message };
    },

    async uploadImage(account, token, bytes, contentType) {
      const init = await rest("/images?action=initializeUpload", token, { method: "POST",
        body: JSON.stringify({ initializeUploadRequest: { owner: account.urn } }) });
      const txt = await init.text();
      const v = (() => { try { return (JSON.parse(txt).value ?? {}) as { uploadUrl?: string; image?: string }; } catch { return {}; } })();
      if (!init.ok || !v.uploadUrl || !v.image) throw new PlatformError(`LinkedIn image upload refused: ${liExplain(init.status, txt).message}`, init.status >= 500);
      const up = await f(v.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        body: new Uint8Array(bytes) });
      if (!up.ok) throw new PlatformError(`LinkedIn image upload failed (${up.status}).`, up.status >= 500);
      return v.image;
    },

    async publish(account, token, p: PublishInput): Promise<PublishResult> {
      const r = await rest("/posts", token, { method: "POST", body: JSON.stringify(liPostBody({ authorUrn: account.urn,
        text: p.text, link: p.link, linkTitle: p.linkTitle, imageUrn: p.mediaId })) });
      if (r.status !== 201) {
        const e = liExplain(r.status, await r.text());
        throw new PlatformError(e.message, e.retry, r.status === 401);
      }
      const urn = r.headers.get("x-restli-id") || "";
      return { externalId: urn, url: urn ? liPostUrl(urn) : null };
    },

    /** Reactions and comments for any post; impressions, clicks and shares for Page posts (rw_organization_admin). */
    async stats(account, token, externalIds): Promise<StatsResult> {
      const byId: StatsResult["byId"] = {};
      let note = "";
      if (account.kind === "page" && externalIds.length) {
        const shares = externalIds.filter((u) => u.includes(":share:")), ugc = externalIds.filter((u) => u.includes(":ugcPost:"));
        const list = (xs: string[]) => `List(${xs.map(encodeURIComponent).join(",")})`;
        let url = `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(account.urn)}`;
        if (shares.length) url += `&shares=${list(shares)}`;
        if (ugc.length) url += `&ugcPosts=${list(ugc)}`;
        const r = await rest(url, token);
        if (r.ok) {
          const d = (await r.json()) as { elements?: { share?: string; ugcPost?: string; totalShareStatistics?: Record<string, number> }[] };
          for (const e of d.elements ?? []) {
            const t = e.totalShareStatistics ?? {}, id = e.share || e.ugcPost;
            if (id) byId[id] = { impressions: t.impressionCount ?? 0, uniqueImpressions: t.uniqueImpressionsCount ?? null,
              clicks: t.clickCount ?? 0, reactions: t.likeCount ?? 0, comments: t.commentCount ?? 0, shares: t.shareCount ?? 0 };
          }
        } else note = r.status === 403 ? "Impressions need the Page-admin permission: reconnect the Page." : `LinkedIn statistics answered ${r.status}.`;
      }
      for (const id of externalIds) {
        if (byId[id]) continue;
        const r = await rest(`/socialActions/${encodeURIComponent(id)}`, token);
        if (!r.ok) continue;
        const d = (await r.json()) as { likesSummary?: { totalLikes?: number }; commentsSummary?: { aggregatedTotalComments?: number; totalFirstLevelComments?: number } };
        byId[id] = { impressions: null, uniqueImpressions: null, clicks: null, shares: null,
          reactions: d.likesSummary?.totalLikes ?? 0,
          comments: d.commentsSummary?.aggregatedTotalComments ?? d.commentsSummary?.totalFirstLevelComments ?? 0 };
      }
      return { byId, note };
    },
  };
}
