"use client";
import { useState, useTransition } from "react";
import { Sparkles, Image as ImageIcon, LayoutTemplate } from "lucide-react";
import { aiCardAction, aiCardCopyAction, aiImageAction, aiWriteAction } from "../actions";

type Kind = "page" | "profile" | "mixed";

/** AI assist: Gemini writes post versions from context; images come from a branded card (free) or Gemini's image model. */
export function AiPanel({ on, kind, text, linkUrl, brandColor, onText, onImage }: {
  on: boolean; kind: Kind; text: string; linkUrl: string; brandColor: string;
  onText: (t: string) => void; onImage: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"write" | "card" | "picture">("write");
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("professional and warm");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [audience, setAudience] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [card, setCard] = useState({ headline: "", sub: "", kicker: "", style: "bold" as "bold" | "light" | "dark", format: "landscape" as "landscape" | "square" | "portrait", color: brandColor });
  const [pic, setPic] = useState({ style: "photo", aspect: "1:1" });
  const [preview, setPreview] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [busyLabel, setBusyLabel] = useState("");

  const ctx = () => (context.trim() || text.trim());
  const go = (label: string, fn: () => Promise<void>) => { setErr(""); setBusyLabel(label); start(async () => { try { await fn(); } finally { setBusyLabel(""); } }); };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="card flex w-full items-center gap-3 text-left transition hover:border-brand">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[#0a66c2] to-[#7c3aed] text-white"><Sparkles size={18} aria-hidden /></span>
        <span><span className="h2 block">AI assist</span><span className="mut text-xs">Write the post and make an image from a short description (Gemini).</span></span>
      </button>
    );
  }
  return (
    <section className="card space-y-3 border-[#d9c8fb]">
      {pending && <div className="loadbar" />}
      <div className="flex items-center justify-between">
        <div className="h2 flex items-center gap-2"><Sparkles size={16} className="text-[#7c3aed]" aria-hidden /> AI assist</div>
        <button type="button" className="mut text-xs hover:text-ink" onClick={() => setOpen(false)}>Hide</button>
      </div>
      {!on && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">Gemini is not set up yet (GEMINI_API_KEY in Vercel). The branded card still works with a headline you type.</p>}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-[13px]" role="tablist">
        {([["write", "Write post", Sparkles], ["card", "Design card", LayoutTemplate], ["picture", "AI picture", ImageIcon]] as const).map(([k, l, I]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 ${tab === k ? "bg-white font-semibold shadow-sm" : "text-mut"}`}><I size={13} aria-hidden />{l}</button>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="ai-ctx">What is it about? {tab !== "write" && <span className="font-normal">(empty = use the post text)</span>}</label>
        <textarea id="ai-ctx" className="input min-h-20" value={context} onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. We are hiring 3 remote marketing interns for spring 2027, 6 months, paid, apply by 15 Jan. Friendly team in Malta." />
      </div>

      {tab === "write" && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div><label className="label" htmlFor="ai-tone">Tone</label>
              <select id="ai-tone" className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
                {["professional and warm", "enthusiastic", "inspiring", "informative and concise", "friendly and casual", "thought leadership"].map((t) => <option key={t}>{t}</option>)}
              </select></div>
            <div><label className="label" htmlFor="ai-len">Length</label>
              <select id="ai-len" className="input" value={length} onChange={(e) => setLength(e.target.value as typeof length)}>
                <option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option>
              </select></div>
            <div><label className="label" htmlFor="ai-aud">Audience (optional)</label><input id="ai-aud" className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="students, HR leaders…" /></div>
          </div>
          <button type="button" className="btn btn-primary" disabled={pending || !on || context.trim().length < 10}
            onClick={() => go("write", async () => {
              const r = await aiWriteAction({ context, tone, length, audience, kind, link: linkUrl || undefined });
              if (!r.ok) return setErr(r.message);
              setVariants(r.variants); setTags(r.hashtags);
            })}>{busyLabel === "write" ? "Writing…" : variants.length ? "Write again" : "Write 3 versions"}</button>
          {busyLabel === "write" && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skel h-16 w-full" />)}</div>}
          {variants.length > 0 && busyLabel !== "write" && (
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="rounded-lg border border-line p-3">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{v}</p>
                  {tags && <p className="mt-1 text-xs text-brand">{tags}</p>}
                  <button type="button" className="btn btn-sm mt-2" onClick={() => onText(tags ? `${v}\n\n${tags}` : v)}>Use this version</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "card" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" disabled={pending || !on || ctx().length < 10}
              onClick={() => go("copy", async () => { const r = await aiCardCopyAction(ctx()); if (!r.ok) return setErr(r.message); setCard({ ...card, headline: r.headline, sub: r.sub, kicker: r.kicker }); })}>
              <Sparkles size={13} aria-hidden /> {busyLabel === "copy" ? "Writing…" : "Suggest the card text"}</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
            <div><label className="label" htmlFor="c-h">Headline</label><input id="c-h" className="input" maxLength={110} value={card.headline} onChange={(e) => setCard({ ...card, headline: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-k">Label</label><input id="c-k" className="input" maxLength={40} value={card.kicker} onChange={(e) => setCard({ ...card, kicker: e.target.value })} placeholder="WE'RE HIRING" /></div>
          </div>
          <div><label className="label" htmlFor="c-s">Line under the headline</label><input id="c-s" className="input" maxLength={160} value={card.sub} onChange={(e) => setCard({ ...card, sub: e.target.value })} /></div>
          <div className="flex flex-wrap items-end gap-3">
            <div><span className="label">Look</span>
              <div className="flex gap-1">{(["bold", "light", "dark"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={card.style === s} onClick={() => setCard({ ...card, style: s })}
                  className={`h-9 w-14 rounded-md border-2 text-[10px] font-semibold capitalize ${card.style === s ? "border-brand" : "border-transparent"}`}
                  style={{ background: s === "bold" ? card.color : s === "dark" ? "#0b1220" : "#f1f5f9", color: s === "light" ? "#0f172a" : "#fff" }}>{s}</button>
              ))}</div></div>
            <div><label className="label" htmlFor="c-f">Shape</label>
              <select id="c-f" className="input w-auto" value={card.format} onChange={(e) => setCard({ ...card, format: e.target.value as typeof card.format })}>
                <option value="landscape">Wide (feed / link)</option><option value="square">Square</option><option value="portrait">Tall (4:5)</option>
              </select></div>
            <div><label className="label" htmlFor="c-c">Colour</label><input id="c-c" type="color" className="h-9 w-12 cursor-pointer rounded-md border border-line" value={card.color} onChange={(e) => setCard({ ...card, color: e.target.value })} /></div>
            <button type="button" className="btn btn-primary" disabled={pending || !card.headline.trim()}
              onClick={() => go("card", async () => { const r = await aiCardAction(card); if (!r.ok) return setErr(r.message); setPreview(r.url); })}>{busyLabel === "card" ? "Drawing…" : "Make the card"}</button>
          </div>
        </div>
      )}

      {tab === "picture" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="label" htmlFor="p-s">Style</label>
              <select id="p-s" className="input w-auto" value={pic.style} onChange={(e) => setPic({ ...pic, style: e.target.value })}>
                <option value="photo">Photo</option><option value="illustration">Illustration</option><option value="abstract">Abstract background</option><option value="3d">3D render</option>
              </select></div>
            <div><label className="label" htmlFor="p-a">Shape</label>
              <select id="p-a" className="input w-auto" value={pic.aspect} onChange={(e) => setPic({ ...pic, aspect: e.target.value })}>
                <option value="1:1">Square</option><option value="4:5">Tall (4:5)</option><option value="16:9">Wide (16:9)</option>
              </select></div>
            <button type="button" className="btn btn-primary" disabled={pending || !on || ctx().length < 10}
              onClick={() => go("pic", async () => { const r = await aiImageAction({ context: ctx(), ...pic }); if (!r.ok) return setErr(r.message); setPreview(r.url); })}>
              {busyLabel === "pic" ? "Drawing… (up to a minute)" : "Make a picture"}</button>
          </div>
          <p className="mut text-xs">Pictures have no text in them (AI often misspells words); put the words in the post or use a Design card.</p>
        </div>
      )}

      {(busyLabel === "card" || busyLabel === "pic") && <div className="skel aspect-[1.91/1] w-full max-w-md" />}
      {preview && !busyLabel && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Generated" className="max-h-72 rounded-lg border border-line" />
          <div className="flex gap-2"><button type="button" className="btn btn-sm btn-primary" onClick={() => onImage(preview)}>Use this image</button>
            <button type="button" className="btn btn-sm" onClick={() => setPreview("")}>Discard</button></div>
        </div>
      )}
      {err && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">{err}</p>}
    </section>
  );
}
