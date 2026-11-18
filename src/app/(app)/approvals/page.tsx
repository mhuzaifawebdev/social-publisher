import { requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtWhen } from "@/lib/time";
import { describeRule } from "@/lib/recur";
import { approvalsQueue } from "@/server/queries";
import { ActionButton } from "@/components/action-button";
import { decideAction } from "../actions";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  await requirePage("admin");
  const [s, list] = await Promise.all([getSettings(), approvalsQueue()]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Approvals</h1>
        <p className="mut mt-1">{s.approval_required ? "Editors' posts wait here until an admin approves them." : "Approval is off (Team & settings). Posts go out without waiting."}</p>
      </div>
      {list.length === 0 ? <div className="card mut py-10 text-center">Nothing is waiting.</div> : list.map((p) => (
        <article key={p.id} className="card space-y-3">
          <div className="mut flex flex-wrap gap-x-3 text-xs">
            <span>By <b className="text-ink">{p.author ?? "–"}</b></span>
            <span>To {p.accounts}</span>
            <span>{p.scheduled_at ? fmtWhen(p.scheduled_at, p.timezone) + ` (${p.timezone})` : "now"}</span>
            {p.rrule && <span className="text-brand">{describeRule(p.rrule)}</span>}
          </div>
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{p.text}</div>
          {p.link_url && <div className="text-xs"><a href={p.link_url} target="_blank" rel="noopener noreferrer" className="text-brand">{p.link_url}</a></div>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image_url && <img src={p.image_url} alt="" className="max-h-48 rounded-lg border border-line" />}
          <div className="flex gap-2">
            <ActionButton action={decideAction.bind(null, p.id, true)} className="btn btn-primary btn-sm">Approve</ActionButton>
            <ActionButton action={decideAction.bind(null, p.id, false)} className="btn btn-danger btn-sm" confirmText="Reject this post?">Reject</ActionButton>
          </div>
        </article>
      ))}
    </div>
  );
}
