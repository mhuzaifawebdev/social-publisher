"use client";
import { buildRule, describeRule, parseRule, type Rule } from "@/lib/recur";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Picks a repeat rule: none, daily, weekly on chosen days, or monthly; ends never / on a date / after N times. */
export function RepeatPicker({ value, onChange }: { value: string; onChange: (rule: string) => void }) {
  const r = parseRule(value);
  const freq = r?.freq ?? "";
  const set = (patch: Partial<Omit<Rule, "freq">> & { freq?: Rule["freq"] | "" }) => {
    const f = patch.freq !== undefined ? patch.freq : freq;
    if (!f) return onChange("");
    onChange(buildRule({ freq: f, interval: patch.interval ?? r?.interval ?? 1, byDay: patch.byDay ?? r?.byDay ?? [],
      until: patch.until !== undefined ? patch.until : r?.until ?? null, count: patch.count !== undefined ? patch.count : r?.count ?? null }));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={freq} onChange={(e) => set({ freq: e.target.value as Rule["freq"] | "" })} aria-label="Repeat">
          <option value="">Does not repeat</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
        </select>
        {freq && (
          <label className="flex items-center gap-1 text-xs text-mut">every
            <input type="number" min={1} max={52} className="input w-16" value={r?.interval ?? 1} onChange={(e) => set({ interval: Number(e.target.value) || 1 })} />
            {freq === "DAILY" ? "day(s)" : freq === "WEEKLY" ? "week(s)" : "month(s)"}
          </label>
        )}
      </div>
      {freq === "WEEKLY" && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
          {DAY_NAMES.map((n, i) => {
            const on = r?.byDay.includes(i);
            return (
              <button type="button" key={n} aria-pressed={on} onClick={() => set({ byDay: on ? r!.byDay.filter((x) => x !== i) : [...(r?.byDay ?? []), i] })}
                className={`rounded-md border px-2 py-1 text-xs ${on ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line text-mut"}`}>{n}</button>
            );
          })}
        </div>
      )}
      {freq && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-mut">
          <span>Ends</span>
          <select className="input w-auto" value={r?.until ? "until" : r?.count ? "count" : "never"}
            onChange={(e) => set(e.target.value === "until" ? { until: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), count: null }
              : e.target.value === "count" ? { count: 5, until: null } : { until: null, count: null })}>
            <option value="never">never</option><option value="until">on a date</option><option value="count">after a number of posts</option>
          </select>
          {r?.until && <input type="date" className="input w-auto" value={r.until} onChange={(e) => set({ until: e.target.value || null })} />}
          {r?.count && <input type="number" min={1} max={365} className="input w-20" value={r.count} onChange={(e) => set({ count: Number(e.target.value) || 1 })} />}
        </div>
      )}
      {freq && <p className="text-xs font-medium text-brand">{describeRule(value)}</p>}
    </div>
  );
}
