import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { envOr } from "@/lib/env";
import { sweep } from "@/server/sweep";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(req: Request) {
  const want = envOr("CRON_SECRET");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!want || !got || want.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

/** The safety-net run: GitHub Actions every 10 minutes and Vercel cron daily (both send CRON_SECRET). */
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const out = await sweep(50_000);
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...out });
}
