"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, Send, Clock, Save, X } from "lucide-react";
import { fill, placeholders, withHashtags, LIMITS } from "@/lib/compose";
import { TIMEZONES } from "@/lib/time";
import { RepeatPicker } from "@/components/repeat-picker";
import { ImageInput } from "@/components/image-input";
import { savePostAction } from "../actions";
import { AiPanel } from "./ai-panel";

type Acc = { id: number; name: string; kind: "page" | "profile"; platform: string; color: string; status: string };
type Tpl = { id: number; name: string; body: string; imageUrl: string | null; linkUrl: string | null; hashtagSetId: number | null;
  linkSetId: number | null; accountIds: number[]; rrule: string | null; time: string | null };
type From = { text: string; linkUrl: string | null; linkTitle: string | null; imageUrl: string | null; hashtagSetId: number | null;
  linkSetId: number | null; accountIds: number[] } | null;

function today(tz: string, plusMin = 0) {
  const d = new Date(Date.now() + plusMin * 60_000);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function ComposeForm({ accounts, templates, hashtagSets, linkSets, defaultTz, approval, initialTemplateId, initialDate, from, geminiOn, brandColor }: {
  accounts: Acc[]; templates: Tpl[]; hashtagSets: { id: number; name: string; tags: string }[];
  linkSets: { id: number; name: string; utmCampaign: string; track: boolean }[]; defaultTz: string; approval: boolean;
  initialTemplateId?: number; initialDate?: string; from: From; geminiOn: boolean; brandColor: string;
}) {
  const router = useRouter();
  const initTpl = templates.find((t) => t.id === initialTemplateId);
  const soon = today(defaultTz, 60);
  const [templateId, setTemplateId] = useState<number | "">(initTpl?.id ?? "");
  const [body, setBody] = useState(from?.text ?? initTpl?.body ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [accountIds, setAccountIds] = useState<number[]>(from?.accountIds ?? initTpl?.accountIds ?? (accounts.length === 1 ? [accounts[0].id] : []));
  const [imageUrl, setImageUrl] = useState(from?.imageUrl ?? initTpl?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(from?.linkUrl ?? initTpl?.linkUrl ?? "");
  const [linkTitle, setLinkTitle] = useState(from?.linkTitle ?? "");
  const [hashtagSetId, setHashtagSetId] = useState<number | "">(from?.hashtagSetId ?? initTpl?.hashtagSetId ?? "");
  const [linkSetId, setLinkSetId] = useState<number | "">(from?.linkSetId ?? initTpl?.linkSetId ?? "");
  const [mode, setMode] = useState<"now" | "schedule">(initialDate || initTpl?.rrule ? "schedule" : "now");
  const [date, setDate] = useState(initialDate ?? soon.date);
  const [time, setTime] = useState(initTpl?.time ?? soon.time);
  const [tz, setTz] = useState(defaultTz);
  const [rrule, setRrule] = useState(initTpl?.rrule ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; duplicate?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const fields = useMemo(() => placeholders(body), [body]);
  const tags = hashtagSets.find((h) => h.id === hashtagSetId)?.tags ?? "";
  const finalText = useMemo(() => withHashtags(fill(body, values), tags), [body, values, tags]);
  const limit = Math.min(...accountIds.map((id) => LIMITS[accounts.find((a) => a.id === id)?.platform ?? "linkedin"] ?? 3000), 3000);

  function pickTemplate(id: number | "") {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(t.body); setValues({});
    if (t.imageUrl) setImageUrl(t.imageUrl);
    if (t.linkUrl) setLinkUrl(t.linkUrl);
    setHashtagSetId(t.hashtagSetId ?? ""); setLinkSetId(t.linkSetId ?? "");
    if (t.accountIds.length) setAccountIds(t.accountIds.filter((x) => accounts.some((a) => a.id === x)));
    if (t.rrule) { setRrule(t.rrule); setMode("schedule"); }
    if (t.time) setTime(t.time);
  }

  function submit(kind: "now" | "schedule" | "draft", allowDuplicate = false) {
    setMsg(null);
    start(async () => {
      const r = await savePostAction({
        text: kind === "draft" ? fill(body, values) : fill(body, values), linkUrl, linkTitle, imageUrl, accountIds, mode: kind, date, time,
        timezone: tz, rrule: kind === "schedule" ? rrule : "", templateId: templateId || undefined,
        hashtagSetId: hashtagSetId || undefined, linkSetId: linkSetId || undefined, allowDuplicate,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.error, duplicate: r.duplicate });
      setMsg({ ok: true, text: r.message });
      if (r.status !== "draft" && !r.outcomes?.some((o) => o.status === "failed")) {
        setBody(""); setValues({}); setImageUrl(""); setLinkUrl(""); setLinkTitle(""); setTemplateId(""); setRrule("");
        router.refresh();
      }
    });
  }

  if (!accounts.length) {
    return <div className="card text-center"><p className="mb-3">Connect a LinkedIn Page or profile first.</p><a className="btn btn-primary" href="/accounts">Go to Accounts</a></div>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      {pending && <div className="loadbar" />}
      <div className="space-y-4">
        <AiPanel on={geminiOn} text={fill(body, values)} linkUrl={linkUrl} brandColor={brandColor}
          kind={(() => { const k = new Set(accounts.filter((a) => accountIds.includes(a.id)).map((a) => a.kind)); return k.size === 1 ? [...k][0] : "mixed"; })()}
          onText={(t) => { setBody(t); setValues({}); setTemplateId(""); }} onImage={setImageUrl} />
        <section className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="tpl">Template</label>
              <select id="tpl" className="input" value={templateId} onChange={(e) => pickTemplate(e.target.value ? Number(e.target.value) : "")}>
                <option value="">No template (write freely)</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="hs">Hashtag set</label>
              <select id="hs" className="input" value={hashtagSetId} onChange={(e) => setHashtagSetId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">None</option>
                {hashtagSets.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-end justify-between">
              <label className="label" htmlFor="body">Post text {fields.length > 0 && <span className="text-brand">· fill the template fields below</span>}</label>
              <span className={`text-xs ${finalText.length > limit ? "font-semibold text-bad" : "text-mut"}`}>{finalText.length} / {limit}</span>
            </div>
            <textarea id="body" className="input min-h-44 resize-y leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="What do you want to share? Use {{name}} for fields you fill each time." />
          </div>
          {fields.length > 0 && (
            <div className="grid gap-2 rounded-lg bg-brand-soft/50 p-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f}>
                  <label className="label" htmlFor={`f-${f}`}>{f.replace(/[_.-]/g, " ")}</label>
                  <input id={`f-${f}`} className="input" value={values[f] ?? ""} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card space-y-3">
          <div className="h2 flex items-center gap-2"><ImagePlus size={16} aria-hidden /> Image and link</div>
          <ImageInput value={imageUrl} onChange={setImageUrl} />
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className="label" htmlFor="link"><Link2 size={12} className="inline" aria-hidden /> Link (shown as a card)</label>
              <input id="link" className="input" type="url" placeholder="https://" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="ls">Link tracking</label>
              <select id="ls" className="input" value={linkSetId} onChange={(e) => setLinkSetId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Default (count clicks)</option>
                {linkSets.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          {linkUrl && (
            <div>
              <label className="label" htmlFor="lt">Link title</label>
              <input id="lt" className="input" maxLength={200} value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="The headline on the link card" />
            </div>
          )}
        </section>

        <section className="card space-y-3">
          <div className="h2">Post to</div>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const on = accountIds.includes(a.id);
              return (
                <button type="button" key={a.id} aria-pressed={on} onClick={() => setAccountIds(on ? accountIds.filter((x) => x !== a.id) : [...accountIds, a.id])}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition ${on ? "border-brand bg-brand-soft font-medium" : "border-line bg-white text-mut hover:bg-slate-50"}`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
                  {a.name} <span className="text-[11px] text-mut">{a.kind === "page" ? "Page" : "Profile"}</span>
                  {a.status !== "active" && <span className="pill bg-warn-soft text-warn">{a.status}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card space-y-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-[13px]" role="tablist">
            {(["now", "schedule"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? "bg-white font-semibold shadow-sm" : "text-mut"}`}>
                {m === "now" ? "Post now" : "Schedule / repeat"}
              </button>
            ))}
          </div>
          {mode === "schedule" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="label" htmlFor="d">Date</label><input id="d" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div><label className="label" htmlFor="t">Time</label><input id="t" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                <div>
                  <label className="label" htmlFor="tz">Timezone</label>
                  <select id="tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select>
                </div>
              </div>
              <RepeatPicker value={rrule} onChange={setRrule} />
            </div>
          )}
          {msg && (
            <div role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
              {msg.text}
              {msg.duplicate && <button type="button" className="btn btn-sm ml-2" onClick={() => submit(mode, true)}>Post anyway</button>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={pending || !accountIds.length || !body.trim() || finalText.length > limit}
              onClick={() => submit(mode)}>
              {mode === "now" ? <><Send size={14} aria-hidden /> {approval ? "Send for approval" : "Post now"}</> : <><Clock size={14} aria-hidden /> Schedule</>}
            </button>
            <button type="button" className="btn" disabled={pending || !body.trim() || !accountIds.length} onClick={() => submit("draft")}><Save size={14} aria-hidden /> Save draft</button>
            {body && <button type="button" className="btn ml-auto" onClick={() => { setBody(""); setValues({}); setTemplateId(""); setMsg(null); }}><X size={14} aria-hidden /> Clear</button>}
          </div>
          {approval && <p className="mut text-xs">Approval is on: editors' posts wait on the Approvals page until an admin approves them.</p>}
        </section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="label">Preview</div>
        <Preview text={finalText} imageUrl={imageUrl} linkUrl={linkUrl} linkTitle={linkTitle}
          account={accounts.find((a) => a.id === accountIds[0])} />
      </aside>
    </div>
  );
}

function Preview({ text, imageUrl, linkUrl, linkTitle, account }: { text: string; imageUrl: string; linkUrl: string; linkTitle: string; account?: Acc }) {
  let host = "";
  try { host = linkUrl ? new URL(linkUrl).hostname.replace(/^www\./, "") : ""; } catch { host = ""; }
  return (
    <div className="card p-0">
      <div className="flex items-center gap-2 p-3">
        <span className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white" style={{ background: account?.color ?? "#94a3b8" }}>
          {(account?.name ?? "?").slice(0, 1)}
        </span>
        <div><div className="text-[13px] font-semibold">{account?.name ?? "Pick an account"}</div><div className="mut text-[11px]">now · 🌐</div></div>
      </div>
      <div className="whitespace-pre-wrap break-words px-3 pb-3 text-[13px] leading-relaxed">
        {text ? text.split(/(#[\p{L}\p{N}_]+|\{\{[^}]+\}\})/u).map((p, i) =>
          p.startsWith("#") ? <span key={i} className="font-semibold text-brand">{p}</span>
            : p.startsWith("{{") ? <mark key={i} className="rounded bg-warn-soft px-0.5 text-warn">{p}</mark> : p)
          : <span className="mut">Your text appears here.</span>}
      </div>
      {linkUrl ? (
        <div className="border-t border-line">
          {imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imageUrl} alt="" className="aspect-[1.91/1] w-full object-cover" />}
          <div className="bg-slate-50 px-3 py-2"><div className="text-[13px] font-semibold">{linkTitle || linkUrl}</div><div className="mut text-[11px]">{host}</div></div>
        </div>
      ) : imageUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={imageUrl} alt="" className="w-full border-t border-line object-cover" />) : null}
    </div>
  );
}
