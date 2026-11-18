import "server-only";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { envOr } from "@/lib/env";
import { randomId } from "@/lib/crypto";

export class ImageError extends Error {}

/** Resizes to at most 1200 px wide and stores in Vercel Blob; returns the public URL used by posts. */
export async function storeImage(input: Buffer, folder = "images"): Promise<string> {
  if (!envOr("BLOB_READ_WRITE_TOKEN")) throw new ImageError("Image storage is not set up (BLOB_READ_WRITE_TOKEN in Vercel).");
  let out: Buffer, png = false;
  try {
    const meta = await sharp(input).metadata();
    png = meta.format === "png" && !!meta.hasAlpha;
    const img = sharp(input, { animated: false }).rotate().resize({ width: 1200, withoutEnlargement: true });
    out = png ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  } catch { throw new ImageError("The image could not be processed."); }
  const blob = await put(`${folder}/${randomId(10)}.${png ? "png" : "jpg"}`, out, { access: "public", contentType: png ? "image/png" : "image/jpeg" });
  return blob.url;
}
