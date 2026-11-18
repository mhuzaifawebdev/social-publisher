"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { COOKIE, checkLogin, hashPassword, signSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function setSession(u: { id: number; email: string; name: string; role: "admin" | "editor" | "viewer" }) {
  (await cookies()).set(COOKIE, await signSession(u), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86400,
  });
}

export async function login(_: { error: string }, form: FormData): Promise<{ error: string }> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email || !password) return { error: "Enter your email and password." };
  const ip = ((await headers()).get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const r = await checkLogin(email, password, ip);
  if (typeof r === "string") return { error: r };
  await setSession(r);
  await audit(r.id, "login");
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

/** First run only: creates the first admin while there are no users at all. */
export async function setupAdmin(_: { error: string }, form: FormData): Promise<{ error: string }> {
  const d = db();
  const [{ n }] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n) return { error: "Setup is already done. Sign in instead." };
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter your name and a valid email." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };
  const [u] = await d.insert(schema.users).values({ name, email, passwordHash: await hashPassword(password), role: "admin" })
    .onConflictDoNothing().returning();
  if (!u) return { error: "Setup is already done. Sign in instead." };
  await setSession({ id: u.id, email: u.email, name: u.name, role: "admin" });
  await audit(u.id, "setup", "first admin created");
  redirect("/accounts");
}
