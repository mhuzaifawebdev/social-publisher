import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { env } from "./env";

export const COOKIE = "sp_session";
const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };
export type SessionUser = { id: number; email: string; name: string; role: Role };

function secret() { return new TextEncoder().encode(env("AUTH_SECRET")); }

export async function signSession(u: SessionUser) {
  return new SignJWT({ name: u.name, email: u.email, role: u.role })
    .setProtectedHeader({ alg: "HS256" }).setSubject(String(u.id)).setIssuedAt().setExpirationTime("7d").sign(secret());
}

/** The logged-in user from the signed cookie (no DB call: pages stay fast). Role changes apply at next login. */
export async function currentUser(): Promise<SessionUser | null> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, secret());
    return { id: Number(payload.sub), email: String(payload.email), name: String(payload.name), role: payload.role as Role };
  } catch { return null; }
}

export function can(u: SessionUser | null, min: Role) { return !!u && RANK[u.role] >= RANK[min]; }

/** For pages: redirects to login, or shows "not allowed". */
export async function requirePage(min: Role = "viewer"): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!can(u, min)) redirect("/?denied=1");
  return u;
}

/** For server actions and API routes: throws. */
export class AuthError extends Error {}
export async function requireRole(min: Role): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new AuthError("Please sign in again.");
  if (!can(u, min)) throw new AuthError("Your role does not allow this.");
  return u;
}

export async function hashPassword(p: string) { return bcrypt.hash(p, 11); }

/** 8 failed tries per email or IP in 15 minutes locks the login for that key. */
export async function checkLogin(email: string, password: string, ip: string): Promise<SessionUser | string> {
  const d = db(); const since = new Date(Date.now() - 15 * 60_000);
  const keys = [`e:${email}`, `ip:${ip}`];
  for (const k of keys) {
    const [{ n }] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.loginAttempts)
      .where(and(eq(schema.loginAttempts.key, k), gt(schema.loginAttempts.at, since)));
    if (n >= 8) return "Too many tries. Wait 15 minutes and try again.";
  }
  const [u] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const ok = !!u && u.active && (await bcrypt.compare(password, u.passwordHash));
  if (!ok) {
    await d.insert(schema.loginAttempts).values(keys.map((key) => ({ key })));
    return "Email or password is wrong.";
  }
  await d.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
