/** Wall-clock time in a timezone <-> UTC, with Intl only (no date library). */
function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}

/** Minutes the zone is ahead of UTC at that instant. */
export function tzOffsetMin(d: Date, tz: string): number {
  const o = parts(d, tz);
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** "2026-11-18" + "10:00" in Europe/Malta -> the UTC instant. Handles daylight-saving changes. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMin(new Date(guess), tz) * 60000;
  t = guess - tzOffsetMin(new Date(t), tz) * 60000; // second pass fixes the DST edge
  return new Date(t);
}

/** UTC instant -> { date: "YYYY-MM-DD", time: "HH:MM", weekday: 0-6 (Sun=0) } in the zone. */
export function utcToZoned(d: Date, tz: string) {
  const o = parts(d, tz);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday);
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}`, weekday: wd };
}

export function fmtWhen(d: Date | string | null | undefined, tz: string): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));
}

export const TIMEZONES = ["Europe/Malta", "Europe/London", "Europe/Berlin", "Asia/Karachi", "Asia/Dubai",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto", "UTC"];
