export function fmtNum(v: number | string | null | undefined): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "–";
  return v >= 10_000 ? `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k` : v.toLocaleString("en-GB");
}

export function Tile({ label, value, hint, prev, now }: { label: string; value: string; hint?: string; prev?: number; now?: number }) {
  let delta: React.ReactNode = null;
  if (prev !== undefined && now !== undefined && (prev || now)) {
    const pct = prev ? Math.round(((now - prev) / prev) * 100) : null;
    const up = now >= prev;
    delta = <span className={`text-[11px] font-semibold ${up ? "text-ok" : "text-bad"}`}>{pct === null ? "new" : `${up ? "▲" : "▼"} ${Math.abs(pct)}%`}</span>;
  }
  return (
    <div className="card" title={hint}>
      <div className="mut text-[11px] font-medium uppercase tracking-wide">{label}</div>
      <div className="mt-1 flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{value}</span>{delta}</div>
    </div>
  );
}

const PILL: Record<string, [string, string]> = {
  scheduled: ["Scheduled", "bg-brand-soft text-brand"], held: ["Waiting approval", "bg-warn-soft text-warn"],
  needs_approval: ["Waiting approval", "bg-warn-soft text-warn"], publishing: ["Publishing", "bg-brand-soft text-brand"],
  published: ["Published", "bg-ok-soft text-ok"], partly_published: ["Partly published", "bg-warn-soft text-warn"],
  failed: ["Failed", "bg-bad-soft text-bad"], cancelled: ["Cancelled", "bg-slate-100 text-mut"], draft: ["Draft", "bg-slate-100 text-mut"],
};
export function StatusPill({ status }: { status: string }) {
  const [t, c] = PILL[status] ?? [status, "bg-slate-100 text-mut"];
  return <span className={`pill ${c}`}>{t}</span>;
}
