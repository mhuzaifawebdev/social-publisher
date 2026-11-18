import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { platform, PlatformError } from "@/platforms";
import type { AccountRef } from "@/platforms/types";

export type Account = typeof schema.socialAccounts.$inferSelect;

export function ref(a: Account): AccountRef {
  return { id: a.id, kind: a.kind, urn: a.urn, externalId: a.externalId, name: a.name };
}

/**
 * A working access token for the account. Renews it with the refresh token when under 7 days are left; marks the
 * account "expired" (and throws an auth error) when it cannot be used any more.
 */
export async function accountToken(a: Account): Promise<string> {
  const left = a.tokenExpiresAt ? a.tokenExpiresAt.getTime() - Date.now() : Infinity;
  if (left < 7 * 864e5 && a.refreshEnc && (!a.refreshExpiresAt || a.refreshExpiresAt.getTime() > Date.now())) {
    try {
      const t = await platform(a.platform).refresh(a.kind, decrypt(a.refreshEnc));
      await db().update(schema.socialAccounts).set({
        tokenEnc: encrypt(t.accessToken), tokenExpiresAt: t.expiresAt,
        refreshEnc: t.refreshToken ? encrypt(t.refreshToken) : a.refreshEnc,
        refreshExpiresAt: t.refreshExpiresAt ?? a.refreshExpiresAt,
        status: "active", lastError: null, updatedAt: new Date(),
      }).where(eq(schema.socialAccounts.id, a.id));
      return t.accessToken;
    } catch (e) {
      if (left <= 0) await markAccount(a.id, "expired", (e as Error).message);
    }
  }
  if (left <= 0) {
    await markAccount(a.id, "expired", "The connection expired. Reconnect this account.");
    throw new PlatformError(`${a.name}: the LinkedIn connection expired. Reconnect it on the Accounts page.`, false, true);
  }
  if (a.status === "disconnected") throw new PlatformError(`${a.name} is disconnected.`, false, true);
  return decrypt(a.tokenEnc);
}

export async function markAccount(id: number, status: Account["status"], error: string | null) {
  await db().update(schema.socialAccounts).set({ status, lastError: error?.slice(0, 500) ?? null, updatedAt: new Date() })
    .where(eq(schema.socialAccounts.id, id));
}
