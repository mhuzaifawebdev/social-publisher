import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { requireRole, AuthError } from "@/lib/auth";
import { appUrl, env } from "@/lib/env";
import { randomId } from "@/lib/crypto";
import { platform } from "@/platforms";
import type { AccountKind } from "@/platforms/types";

/** Starts "Connect": sends the person to the platform's sign-in, with a signed state bound to this browser. */
export async function GET(_: Request, ctx: { params: Promise<{ platform: string; kind: string }> }) {
  const { platform: pid, kind } = await ctx.params;
  try {
    const user = await requireRole(kind === "page" ? "admin" : "editor");
    if (kind !== "page" && kind !== "profile") throw new Error("Unknown account type.");
    const p = platform(pid);
    if (!p.configured(kind as AccountKind)) {
      return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent(`The ${p.label} ${kind === "page" ? "Page" : "profile"} app keys are not set yet (see README).`)}`);
    }
    const nonce = randomId(12);
    const state = await new SignJWT({ uid: user.id, kind, pid, nonce }).setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30m").sign(new TextEncoder().encode(env("AUTH_SECRET")));
    const res = NextResponse.redirect(p.connectUrl(kind as AccountKind, state, `${appUrl()}/api/connect/${pid}/callback`));
    res.cookies.set("sp_oauth", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 1800 });
    return res;
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.redirect(`${appUrl()}/login`);
    return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent((e as Error).message)}`);
  }
}
