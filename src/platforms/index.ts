import "server-only";
import { envOr } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/settings";
import { linkedin } from "./linkedin";
import type { AccountKind, PlatformAdapter } from "./types";

const li = linkedin({
  clientId: (k: AccountKind) => envOr(k === "page" ? "LINKEDIN_PAGE_CLIENT_ID" : "LINKEDIN_MEMBER_CLIENT_ID"),
  clientSecret: (k: AccountKind) => envOr(k === "page" ? "LINKEDIN_PAGE_CLIENT_SECRET" : "LINKEDIN_MEMBER_CLIENT_SECRET"),
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
