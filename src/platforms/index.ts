import "server-only";
import { envOr } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/settings";
import { linkedin } from "./linkedin";
import type { AccountKind, PlatformAdapter } from "./types";

export const liPageId = () => envOr("LINKEDIN_PAGE_CLIENT_ID") || envOr("LINKEDIN_CLIENT_ID");
export const liPageSecret = () => envOr("LINKEDIN_PAGE_CLIENT_SECRET") || envOr("LINKEDIN_CLIENT_SECRET");

const li = linkedin({
  // Pages app: LINKEDIN_PAGE_CLIENT_* (or the HR tool's names LINKEDIN_CLIENT_*); profiles app: LINKEDIN_MEMBER_CLIENT_*
  clientId: (k: AccountKind) => k === "page" ? liPageId() : envOr("LINKEDIN_MEMBER_CLIENT_ID"),
  clientSecret: (k: AccountKind) => k === "page" ? liPageSecret() : envOr("LINKEDIN_MEMBER_CLIENT_SECRET"),
  getVersion: () => getSetting("linkedin_version_ok"),
  saveVersion: (v) => setSetting("linkedin_version_ok", v),
});

export const PLATFORMS: Record<string, PlatformAdapter> = { linkedin: li };
export function platform(id: string): PlatformAdapter {
  const p = PLATFORMS[id];
  if (!p) throw new Error(`Platform ${id} is not supported yet.`);
  return p;
}
export { PlatformError } from "./types";
