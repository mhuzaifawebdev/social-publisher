"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { placeholders } from "@/lib/compose";
import { describeRule } from "@/lib/recur";
import { RepeatPicker } from "@/components/repeat-picker";
import { ImageInput } from "@/components/image-input";
import { deleteHashtagSet, deleteLinkSet, deleteTemplate, saveHashtagSet, saveLinkSet, saveTemplate } from "../actions";

type Tpl = { id: number; name: string; body: string; imageUrl: string | null; linkUrl: string | null; hashtagSetId: number | null;
  linkSetId: number | null; accountIds: number[]; rrule: string | null; time: string | null };
type HS = { id: number; name: string; tags: string };
type LS = { id: number; name: string; utmSource: string; utmMedium: string; utmCampaign: string; track: boolean };
type Acc = { id: number; name: string; color: string };

const EMPTY: Tpl = { id: 0, name: "", body: "", imageUrl: "", linkUrl: "", hashtagSetId: null, linkSetId: null, accountIds: [], rrule: "", time: "" };

export function TemplatesUI({ templates, hashtagSets, linkSets, accounts }: { templates: Tpl[]; hashtagSets: HS[]; linkSets: LS[]; accounts: Acc[] }) {
  const [tab, setTab] = useState<"t" | "h" | "l">("t");
  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1 text-[13px]" role="tablist">
        {([["t", `Templates (${templates.length})`], ["h", `Hashtag sets (${hashtagSets.length})`], ["l", `Link tracking (${linkSets.length})`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-white font-semibold shadow-sm" : "text-mut"}`}>{l}</button>
        ))}
      </div>
      {tab === "t" && <TemplateList templates={templates} hashtagSets={hashtagSets} linkSets={linkSets} accounts={accounts} />}
      {tab === "h" && <HashtagSets sets={hashtagSets} />}
      {tab === "l" && <LinkSets sets={linkSets} />}
    </div>
  );
}

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => start(async () => {
    const r = await fn(); setMsg(r); if (r.ok) { after?.(); router.refresh(); }
  });
  return { pending, msg, run, setMsg };
}

function Msg({ m }: { m: { ok: boolean; message: string } | null }) {
  return m ? <p role="status" className={`text-xs ${m.ok ? "text-ok" : "text-bad"}`}>{m.message}</p> : null;
}

function TemplateList({ templates, hashtagSets, linkSets, accounts }: { templates: Tpl[]; hashtagSets: HS[]; linkSets: LS[]; accounts: Acc[] }) {
  const [edit, setEdit] = useState<Tpl | null>(null);
  const { pending, msg, run } = useSave();
  if (edit) return <TemplateEditor t={edit} hashtagSets={hashtagSets} linkSets={linkSets} accounts={accounts} onDone={() => setEdit(null)} />;
  return (
    <div className="space-y-3">
      {pending && <div className="loadbar" />}
      <button className="btn btn-primary" onClick={() => setEdit({ ...EMPTY })}>New template</button>
      <Msg m={msg} />
      {templates.length === 0 && <div className="card mut py-8 text-center">No templates yet. A template is a post you reuse, with fields like {"{{job_title}}"} filled in each time.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((t) => (
          <article key={t.id} className="card flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{t.name}</h3>
              {t.rrule && <span className="pill bg-brand-soft text-brand">{describeRule(t.rrule)}{t.time ? ` · ${t.time}` : ""}</span>}
            </div>
            <p className="mut line-clamp-3 whitespace-pre-wrap text-[13px]">{t.body}</p>
            {placeholders(t.body).length > 0 && <div className="flex flex-wrap gap-1">{placeholders(t.body).map((p) => <span key={p} className="pill bg-slate-100 text-mut">{p}</span>)}</div>}
            <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
              <Link href={`/compose?template=${t.id}`} className="btn btn-sm btn-primary">Use</Link>
              <button className="btn btn-sm" onClick={() => setEdit({ ...t, imageUrl: t.imageUrl ?? "", linkUrl: t.linkUrl ?? "", rrule: t.rrule ?? "", time: t.time ?? "" })}>Edit</button>
              <button className="btn btn-sm" onClick={() => setEdit({ ...t, id: 0, name: `${t.name} (copy)`, imageUrl: t.imageUrl ?? "", linkUrl: t.linkUrl ?? "", rrule: t.rrule ?? "", time: t.time ?? "" })}>Duplicate</button>
              <button className="btn btn-sm btn-danger ml-auto" onClick={() => confirm(`Delete "${t.name}"?`) && run(() => deleteTemplate(t.id))}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({ t, hashtagSets, linkSets, accounts, onDone }: { t: Tpl; hashtagSets: HS[]; linkSets: LS[]; accounts: Acc[]; onDone: () => void }) {
  const [v, setV] = useState<Tpl>(t);
  const { pending, msg, run } = useSave();
  const set = (p: Partial<Tpl>) => setV({ ...v, ...p });
  return (
    <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveTemplate({ ...v, id: v.id || undefined,
      hashtagSetId: v.hashtagSetId || undefined, linkSetId: v.linkSetId || undefined }), onDone); }}>
      {pending && <div className="loadbar" />}
      <h2 className="h2">{v.id ? "Edit template" : "New template"}</h2>
      <div><label className="label" htmlFor="tn">Name</label><input id="tn" className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} /></div>
      <div>
        <label className="label" htmlFor="tb">Text, with {"{{fields}}"} to fill each time (e.g. {"{{job_title}}"}, {"{{city}}"}, {"{{link}}"})</label>
        <textarea id="tb" className="input min-h-40" value={v.body} onChange={(e) => set({ body: e.target.value })} required />
        {placeholders(v.body).length > 0 && <p className="mt-1 text-xs text-brand">Fields: {placeholders(v.body).join(", ")}</p>}
      </div>
      <div><span className="label">Image</span><ImageInput value={v.imageUrl ?? ""} onChange={(u) => set({ imageUrl: u })} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="tl">Default link</label><input id="tl" type="url" className="input" value={v.linkUrl ?? ""} onChange={(e) => set({ linkUrl: e.target.value })} placeholder="https://" /></div>
        <div>
          <label className="label" htmlFor="th">Hashtag set</label>
          <select id="th" className="input" value={v.hashtagSetId ?? ""} onChange={(e) => set({ hashtagSetId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>{hashtagSets.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tk">Link tracking</label>
          <select id="tk" className="input" value={v.linkSetId ?? ""} onChange={(e) => set({ linkSetId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Default</option>{linkSets.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <span className="label">Default accounts</span>
        <div className="flex flex-wrap gap-2">
          {accounts.length === 0 && <span className="mut text-xs">No accounts connected yet.</span>}
          {accounts.map((a) => {
            const on = v.accountIds.includes(a.id);
            return <button type="button" key={a.id} aria-pressed={on} onClick={() => set({ accountIds: on ? v.accountIds.filter((x) => x !== a.id) : [...v.accountIds, a.id] })}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${on ? "border-brand bg-brand-soft font-medium" : "border-line text-mut"}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: a.color }} aria-hidden />{a.name}</button>;
          })}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div><span className="label">Default repeat</span><RepeatPicker value={v.rrule ?? ""} onChange={(r) => set({ rrule: r })} /></div>
        <div><label className="label" htmlFor="tt">Default time</label><input id="tt" type="time" className="input" value={v.time ?? ""} onChange={(e) => set({ time: e.target.value })} /></div>
      </div>
      <Msg m={msg} />
      <div className="flex gap-2"><button className="btn btn-primary" disabled={pending}>Save template</button><button type="button" className="btn" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

function HashtagSets({ sets }: { sets: HS[] }) {
  const [v, setV] = useState<{ id?: number; name: string; tags: string }>({ name: "", tags: "" });
  const { pending, msg, run } = useSave();
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      {pending && <div className="loadbar" />}
      <div className="card overflow-x-auto p-0">
        <table className="tbl"><thead><tr><th>Name</th><th>Hashtags</th><th></th></tr></thead><tbody>
          {sets.length === 0 && <tr><td colSpan={3} className="mut py-6 text-center">No hashtag sets yet.</td></tr>}
          {sets.map((h) => (
            <tr key={h.id}><td className="font-medium">{h.name}</td><td className="text-brand">{h.tags}</td>
              <td className="whitespace-nowrap text-right"><button className="btn btn-sm" onClick={() => setV(h)}>Edit</button>{" "}
                <button className="btn btn-sm btn-danger" onClick={() => confirm(`Delete "${h.name}"?`) && run(() => deleteHashtagSet(h.id))}>Delete</button></td></tr>
          ))}
        </tbody></table>
      </div>
      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveHashtagSet(v), () => setV({ name: "", tags: "" })); }}>
        <h2 className="h2">{v.id ? "Edit set" : "New hashtag set"}</h2>
        <div><label className="label" htmlFor="hn">Name</label><input id="hn" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></div>
        <div><label className="label" htmlFor="ht">Hashtags (spaces or commas)</label><textarea id="ht" className="input min-h-20" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} placeholder="#internships #careers #hiring" required /></div>
        <Msg m={msg} />
        <div className="flex gap-2"><button className="btn btn-primary" disabled={pending}>Save</button>{v.id && <button type="button" className="btn" onClick={() => setV({ name: "", tags: "" })}>New</button>}</div>
      </form>
    </div>
  );
}

function LinkSets({ sets }: { sets: LS[] }) {
  const blank = { name: "", utmSource: "linkedin", utmMedium: "social", utmCampaign: "", track: true };
  const [v, setV] = useState<Omit<LS, "id"> & { id?: number }>(blank);
  const { pending, msg, run } = useSave();
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      {pending && <div className="loadbar" />}
      <div className="card overflow-x-auto p-0">
        <table className="tbl"><thead><tr><th>Name</th><th>UTM tags</th><th>Click counter</th><th></th></tr></thead><tbody>
          {sets.length === 0 && <tr><td colSpan={4} className="mut py-6 text-center">No link sets yet. Without one, links get utm_source=linkedin and clicks are counted.</td></tr>}
          {sets.map((l) => (
            <tr key={l.id}><td className="font-medium">{l.name}</td><td className="text-xs">source={l.utmSource} · medium={l.utmMedium}{l.utmCampaign ? ` · campaign=${l.utmCampaign}` : ""}</td>
              <td>{l.track ? "on" : "off"}</td>
              <td className="whitespace-nowrap text-right"><button className="btn btn-sm" onClick={() => setV(l)}>Edit</button>{" "}
                <button className="btn btn-sm btn-danger" onClick={() => confirm(`Delete "${l.name}"?`) && run(() => deleteLinkSet(l.id))}>Delete</button></td></tr>
          ))}
        </tbody></table>
      </div>
      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveLinkSet(v), () => setV(blank)); }}>
        <h2 className="h2">{v.id ? "Edit link set" : "New link set"}</h2>
        <div><label className="label" htmlFor="ln">Name</label><input id="ln" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="us">utm_source</label><input id="us" className="input" value={v.utmSource} onChange={(e) => setV({ ...v, utmSource: e.target.value })} /></div>
          <div><label className="label" htmlFor="um">utm_medium</label><input id="um" className="input" value={v.utmMedium} onChange={(e) => setV({ ...v, utmMedium: e.target.value })} /></div>
        </div>
        <div><label className="label" htmlFor="uc">utm_campaign</label><input id="uc" className="input" value={v.utmCampaign} onChange={(e) => setV({ ...v, utmCampaign: e.target.value })} placeholder="e.g. spring-internships" /></div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v.track} onChange={(e) => setV({ ...v, track: e.target.checked })} className="accent-[#0a66c2]" /> Count clicks with our short link</label>
        <Msg m={msg} />
        <div className="flex gap-2"><button className="btn btn-primary" disabled={pending}>Save</button>{v.id && <button type="button" className="btn" onClick={() => setV(blank)}>New</button>}</div>
      </form>
    </div>
  );
}
