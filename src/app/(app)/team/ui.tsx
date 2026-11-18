"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES } from "@/lib/time";
import { addUser, saveSettings, updateUser } from "../actions";

type U = { id: number; name: string; email: string; role: "admin" | "editor" | "viewer"; active: boolean; lastLoginAt: string };
const ROLES = { admin: "Admin: everything, connects Pages, approves", editor: "Editor: writes and schedules posts", viewer: "Viewer: sees posts and reports" };

export function TeamUI({ meId, users, settings }: { meId: number; users: U[]; settings: { approval_required: boolean; default_timezone: string; brand_name: string; brand_color: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [nu, setNu] = useState({ name: "", email: "", role: "editor" as U["role"], password: "" });
  const [st, setSt] = useState(settings);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => start(async () => { const r = await fn(); setMsg(r); if (r.ok) { after?.(); router.refresh(); } });

  return (
    <div className="space-y-5">
      {pending && <div className="loadbar" />}
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{msg.message}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="card overflow-x-auto p-0">
          <table className="tbl"><thead><tr><th>Person</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead><tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td><div className="font-medium">{u.name}{u.id === meId && <span className="mut"> (you)</span>}</div><div className="mut text-xs">{u.email}</div></td>
                <td>
                  <select className="input w-auto py-1" value={u.role} disabled={u.id === meId} aria-label={`Role of ${u.name}`}
                    onChange={(e) => run(() => updateUser(u.id, { role: e.target.value as U["role"] }))}>
                    <option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="whitespace-nowrap text-xs">{u.lastLoginAt || "never"}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn btn-sm" onClick={() => { const p = prompt(`New password for ${u.name} (10+ characters):`); if (p) run(() => updateUser(u.id, { password: p })); }}>Password</button>{" "}
                  {u.id !== meId && <button className="btn btn-sm" onClick={() => run(() => updateUser(u.id, { active: !u.active }))}>{u.active ? "Deactivate" : "Activate"}</button>}
                </td>
              </tr>
            ))}
          </tbody></table>
        </section>
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => addUser(nu), () => setNu({ name: "", email: "", role: "editor", password: "" })); }}>
          <h2 className="h2">Add a person</h2>
          <div><label className="label" htmlFor="nn">Name</label><input id="nn" className="input" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} required /></div>
          <div><label className="label" htmlFor="ne">Email</label><input id="ne" type="email" className="input" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required /></div>
          <div>
            <label className="label" htmlFor="nr">Role</label>
            <select id="nr" className="input" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as U["role"] })}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="np">First password (10+ characters)</label><input id="np" type="text" autoComplete="off" className="input" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} minLength={10} required /></div>
          <button className="btn btn-primary" disabled={pending}>Add</button>
        </form>
      </div>
      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSettings(st)); }}>
        <h2 className="h2">Posting settings</h2>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 accent-[#0a66c2]" checked={st.approval_required} onChange={(e) => setSt({ ...st, approval_required: e.target.checked })} />
          <span><b>Approval before posting.</b> <span className="mut">Editors&apos; posts wait on the Approvals page until an admin approves them. Admins&apos; posts go straight out.</span></span>
        </label>
        <div className="max-w-xs">
          <label className="label" htmlFor="tz">Team timezone (dashboard, calendar, reports)</label>
          <select id="tz" className="input" value={st.default_timezone} onChange={(e) => setSt({ ...st, default_timezone: e.target.value })}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="w-64"><label className="label" htmlFor="bn">Brand name (on AI posts and cards)</label>
            <input id="bn" className="input" maxLength={80} value={st.brand_name} onChange={(e) => setSt({ ...st, brand_name: e.target.value })} placeholder="Paragon Global Internships" /></div>
          <div><label className="label" htmlFor="bc">Brand colour</label>
            <input id="bc" type="color" className="h-9 w-14 cursor-pointer rounded-md border border-line" value={st.brand_color} onChange={(e) => setSt({ ...st, brand_color: e.target.value })} /></div>
        </div>
        <button className="btn btn-primary" disabled={pending}>Save settings</button>
      </form>
    </div>
  );
}
