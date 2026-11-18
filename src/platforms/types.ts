/** One interface for every social platform. LinkedIn is first; Facebook/Instagram adapters plug in later. */
export type AccountKind = "page" | "profile";

export type TokenSet = {
  accessToken: string; expiresAt: Date | null;
  refreshToken: string | null; refreshExpiresAt: Date | null; scopes: string;
};
export type ConnectOption = { id: string; urn: string; name: string; avatarUrl?: string | null; role?: string };
export type AccountRef = { id: number; kind: AccountKind; urn: string; externalId: string; name: string };
export type PublishInput = { text: string; link?: string | null; linkTitle?: string | null; mediaId?: string | null };
export type PublishResult = { externalId: string; url: string | null };
export type StatNumbers = { impressions: number | null; uniqueImpressions: number | null; clicks: number | null;
  reactions: number | null; comments: number | null; shares: number | null };
export type StatsResult = { byId: Record<string, StatNumbers>; note: string };

export interface PlatformAdapter {
  id: string;
  label: string;
  kinds: AccountKind[];
  configured(kind: AccountKind): boolean;
  connectUrl(kind: AccountKind, state: string, redirectUri: string): string;
  exchange(kind: AccountKind, code: string, redirectUri: string): Promise<TokenSet>;
  refresh(kind: AccountKind, refreshToken: string): Promise<TokenSet>;
  options(kind: AccountKind, token: string): Promise<ConnectOption[]>;
  lookupPage?(token: string, idOrLink: string): Promise<ConnectOption | null>;
  check(account: AccountRef, token: string): Promise<{ ok: boolean; note: string }>;
  uploadImage(account: AccountRef, token: string, bytes: Uint8Array, contentType: string): Promise<string>;
  publish(account: AccountRef, token: string, input: PublishInput): Promise<PublishResult>;
  stats(account: AccountRef, token: string, externalIds: string[]): Promise<StatsResult>;
}

/** retry = trying again later can help; auth = the account must be reconnected. */
export class PlatformError extends Error {
  constructor(message: string, public retry = false, public auth = false) { super(message); }
}
