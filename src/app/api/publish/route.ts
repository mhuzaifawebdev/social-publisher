import { NextResponse } from "next/server";
import { verifyQstash } from "@/server/queue";
import { publishTarget } from "@/server/publish";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Called by Upstash QStash at the scheduled minute. Signed by QStash; anything else is refused. */
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQstash(req.headers.get("upstash-signature"), body))) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  let targetId = 0;
  try { targetId = Number(JSON.parse(body).targetId) || 0; } catch { /* bad body */ }
  if (!targetId) return NextResponse.json({ error: "No target." }, { status: 400 });
  const r = await publishTarget(targetId);
  // 200 even when the post failed: QStash must not re-send; our own retry logic already decided.
  return NextResponse.json(r);
}
