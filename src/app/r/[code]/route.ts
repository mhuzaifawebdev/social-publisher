import { NextResponse } from "next/server";
import { after } from "next/server";
import { db, schema } from "@/db";
import { resolveLink } from "@/server/publish";

export const runtime = "nodejs";

const BOTS = /bot|crawler|spider|preview|linkedinbot|facebookexternalhit|slack|whatsapp|curl|wget/i;

/** Our tracked link: counts the click (not link-preview bots), then sends the person on with UTM tags. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!/^[\w-]{4,20}$/.test(code)) return new NextResponse("Not found", { status: 404 });
  const link = await resolveLink(code);
  if (!link) return new NextResponse("This link is no longer available.", { status: 404 });
  const ua = req.headers.get("user-agent") || "";
  if (!BOTS.test(ua) && req.method === "GET") {
    const referrer = (req.headers.get("referer") || "").slice(0, 300) || null;
    after(() => db().insert(schema.linkClicks).values({ targetId: link.targetId, referrer }).then(() => undefined));
  }
  return NextResponse.redirect(link.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
