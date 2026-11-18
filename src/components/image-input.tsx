"use client";
import { useRef, useState } from "react";

/** Upload an image (resized on the server and stored in Vercel Blob) or paste an image link. */
export function ImageInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function upload(f: File) {
    setErr("");
    if (f.size > 8 * 1024 * 1024) return setErr("The image is over 8 MB.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error || "Upload failed.");
      onChange(d.url);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Uploading…" : "Upload image"}</button>
        <span className="mut text-xs">or</span>
        <input className="input max-w-sm flex-1" type="url" placeholder="Image link (https://…)" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Image link" />
        {value && <button type="button" className="btn btn-sm" onClick={() => onChange("")}>Remove</button>}
      </div>
      {busy && <div className="skel h-24 w-40" />}
      {value && !busy && /* eslint-disable-next-line @next/next/no-img-element */ <img src={value} alt="Selected" className="h-24 rounded-lg border border-line object-cover" />}
      {err && <p className="text-xs text-bad" role="alert">{err}</p>}
    </div>
  );
}
