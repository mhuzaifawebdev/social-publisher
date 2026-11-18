import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { appUrl, env } from "@/lib/env";
import { encrypt, randomId } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { platform } from "@/platforms";
import type { AccountKind } from "@/platforms/types";
import { saveAccounts } from "@/server/connect";

/** The platform sends the person back here with a one-time code. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: pid } = await ctx.params;
  const back = (q: string) => NextResponse.redirect(`${appUrl()}/accounts?${q}`);
  const sp = req.nextUrl.searchParams;
  const unhtml = (x: string) => x.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  if (sp.get("error")) return back(`error=${encodeURIComponent(`Not connected: ${unhtml(sp.get("error_description") || sp.get("error") || "")}`)}`);
  try {
    const user = await currentUser();
    if (!user) return NextResponse.redirect(`${appUrl()}/login`);
    const { payload } = await jwtVerify(sp.get("state") || "", new TextEncoder().encode(env("AUTH_SECRET")));
    if (payload.uid !== user.id || payload.pid !== pid || payload.nonce !== req.cookies.get("sp_oauth")?.value) {
      return back(`error=${encodeURIComponent("This sign-in link expired or belongs to another session. Press Connect again.")}`);
    }
    const kind = payload.kind as AccountKind;
    const p = platform(pid);
    const tok = await p.exchange(kind, sp.get("code") || "", `${appUrl()}/api/connect/${pid}/callback`);
    const options = await p.options(kind, tok.accessToken);
    if (!options.length) return back(`error=${encodeURIComponent("You are not an admin of any LinkedIn Page. Ask a Page admin to connect, or add you as an admin.")}`);
    if (kind === "profile") {
      await saveAccounts(user.id, pid, kind, tok, options);
      await audit(user.id, "account.connected", `${pid} profile ${options[0].name}`);
      const res = back(`ok=${encodeURIComponent(`${options[0].name} connected.`)}`);
      res.cookies.delete("sp_oauth");
      return res;
    }
    const id = randomId(16);
    await db().insert(schema.connectSessions).values({ id, userId: user.id, platform: pid, kind, tokenEnc: encrypt(tok.accessToken),
      refreshEnc: tok.refreshToken ? encrypt(tok.refreshToken) : null, tokenExpiresAt: tok.expiresAt, refreshExpiresAt: tok.refreshExpiresAt,
      scopes: tok.scopes, options });
    const res = NextResponse.redirect(`${appUrl()}/accounts/choose/${id}`);
    res.cookies.delete("sp_oauth");
    return res;
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message || "Could not connect.")}`);
  }
}
