import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt } from "@/lib/crypto";
import type { ConnectOption, TokenSet } from "@/platforms/types";

const COLORS = ["#0a66c2", "#7c3aed", "#0d9488", "#c2410c", "#be185d", "#4d7c0f", "#1d4ed8", "#a16207"];

/** Adds the chosen Pages / the profile, or refreshes their tokens when they are already connected. */
export async function saveAccounts(userId: number, pid: string, kind: "page" | "profile", tok: TokenSet, chosen: ConnectOption[]) {
  const d = db();
  const [{ n }] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.socialAccounts);
  let i = n;
  for (const o of chosen) {
    await d.insert(schema.socialAccounts).values({
      platform: pid, kind, externalId: o.id, urn: o.urn, name: o.name, avatarUrl: o.avatarUrl ?? null, color: COLORS[i++ % COLORS.length],
      tokenEnc: encrypt(tok.accessToken), refreshEnc: tok.refreshToken ? encrypt(tok.refreshToken) : null,
      tokenExpiresAt: tok.expiresAt, refreshExpiresAt: tok.refreshExpiresAt, scopes: tok.scopes, status: "active", connectedBy: userId,
    }).onConflictDoUpdate({
      target: [schema.socialAccounts.platform, schema.socialAccounts.urn],
      set: { name: o.name, avatarUrl: o.avatarUrl ?? null, tokenEnc: encrypt(tok.accessToken),
        refreshEnc: tok.refreshToken ? encrypt(tok.refreshToken) : null, tokenExpiresAt: tok.expiresAt,
        refreshExpiresAt: tok.refreshExpiresAt, scopes: tok.scopes, status: "active", lastError: null, connectedBy: userId, updatedAt: new Date() },
    });
  }
}
