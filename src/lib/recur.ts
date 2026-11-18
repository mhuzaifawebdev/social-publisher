/**
 * Repeat rules, a small RFC 5545 subset: FREQ=DAILY|WEEKLY|MONTHLY; INTERVAL=n; BYDAY=MO,TU (weekly);
 * UNTIL=YYYYMMDD; COUNT=n. Occurrences are computed in the post's own timezone (wall clock), so "every
 * Tuesday 10:00 Malta" stays 10:00 across daylight-saving changes.
 */
import { utcToZoned, zonedToUtc } from "./time";

export type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number; byDay: number[]; until: string | null; count: number | null;
};
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function parseRule(s: string | null | undefined): Rule | null {
  if (!s) return null;
  const kv: Record<string, string> = {};
  for (const p of s.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = p.split("=");
    if (k && v) kv[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = kv.FREQ as Rule["freq"];
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) return null;
  const until = /^\d{8}$/.test(kv.UNTIL || "") ? `${kv.UNTIL.slice(0, 4)}-${kv.UNTIL.slice(4, 6)}-${kv.UNTIL.slice(6, 8)}` : null;
  return {
    freq,
    interval: Math.max(1, Math.min(52, Number(kv.INTERVAL) || 1)),
    byDay: (kv.BYDAY || "").split(",").map((d) => DAYS.indexOf(d)).filter((d) => d >= 0).sort(),
    until,
    count: kv.COUNT ? Math.max(1, Number(kv.COUNT) || 1) : null,
  };
}

export function buildRule(r: { freq: Rule["freq"]; interval?: number; byDay?: number[]; until?: string | null;
  count?: number | null }): string {
  const out = [`FREQ=${r.freq}`];
  if (r.interval && r.interval > 1) out.push(`INTERVAL=${r.interval}`);
  if (r.freq === "WEEKLY" && r.byDay?.length) out.push(`BYDAY=${[...r.byDay].sort().map((d) => DAYS[d]).join(",")}`);
  if (r.until) out.push(`UNTIL=${r.until.replace(/-/g, "")}`);
  if (r.count) out.push(`COUNT=${r.count}`);
  return out.join(";");
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(date: string) { return new Date(date + "T00:00:00Z").getUTCDay(); }

/**
 * The next occurrence after `prev` (the one just published), or null when the series is over.
 * done = how many occurrences exist so far (for COUNT).
 */
export function nextOccurrence(ruleStr: string, prev: Date, tz: string, done = 1): Date | null {
  const r = parseRule(ruleStr);
  if (!r) return null;
  if (r.count && done >= r.count) return null;
  const { date, time } = utcToZoned(prev, tz);
  let next: string;
  if (r.freq === "DAILY") next = addDays(date, r.interval);
  else if (r.freq === "MONTHLY") {
    const [y, m, d] = date.split("-").map(Number);
    let mm = m - 1 + r.interval;
    const yy = y + Math.floor(mm / 12);
    mm %= 12;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    next = `${yy}-${String(mm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  } else {
    const days = r.byDay.length ? r.byDay : [weekday(date)];
    const wd = weekday(date);
    const later = days.find((d) => d > wd);
    next = later !== undefined ? addDays(date, later - wd) : addDays(date, 7 * r.interval - wd + days[0]);
  }
  if (r.until && next > r.until) return null;
  return zonedToUtc(next, time, tz);
}

export function describeRule(ruleStr: string | null | undefined): string {
  const r = parseRule(ruleStr);
  if (!r) return "";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let s = r.freq === "DAILY" ? (r.interval > 1 ? `Every ${r.interval} days` : "Every day")
    : r.freq === "MONTHLY" ? (r.interval > 1 ? `Every ${r.interval} months` : "Every month")
    : `${r.interval > 1 ? `Every ${r.interval} weeks` : "Every week"}${r.byDay.length ? " on " + r.byDay.map((d) => names[d]).join(", ") : ""}`;
  if (r.until) s += `, until ${r.until}`;
  if (r.count) s += `, ${r.count} times`;
  return s;
}
