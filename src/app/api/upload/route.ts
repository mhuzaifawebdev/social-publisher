import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { storeImage, ImageError } from "@/server/images";

export const runtime = "nodejs";

/** Image upload: resized to at most 1200 px wide (LinkedIn's feed size) and saved in Vercel Blob. */
export async function POST(req: Request) {
  try {
    await requireRole("editor");
    const f = (await req.formData()).get("file");
    if (!(f instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
    if (f.size > 8 * 1024 * 1024) return NextResponse.json({ error: "The image is over 8 MB." }, { status: 400 });
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return NextResponse.json({ error: "Use a PNG, JPG, WEBP or GIF image." }, { status: 400 });
    return NextResponse.json({ url: await storeImage(Buffer.from(await f.arrayBuffer())) });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ImageError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "The image could not be saved." }, { status: 500 });
  }
}
