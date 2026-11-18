import Link from "next/link";
import { can, requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { utcToZoned, zonedToUtc } from "@/lib/time";
import { calendarRange } from "@/server/queries";
import { CalendarGrid, type CalItem } from "./grid";

export const metadata = { title: "Calendar" };

function monthOf(m: string | undefined, tz: string) {
  if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  return utcToZoned(new Date(), tz).date.slice(0, 7);
}
function shift(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requirePage("viewer");
  const s = await getSettings();
  const tz = s.default_timezone;
  const m = monthOf((await searchParams).m, tz);
  const [y, mo] = m.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;                 // weeks start on Monday
  const gridStart = new Date(first.getTime() - startOffset * 864e5);
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 864e5).toISOString().slice(0, 10));
  const rows = await calendarRange(zonedToUtc(days[0], "00:00", tz).toISOString(), zonedToUtc(days[41], "23:59", tz).toISOString());
  const items: CalItem[] = rows.map((r) => {
    const z = utcToZoned(new Date(r.scheduled_at), tz);
    return { postId: r.post_id, targetId: r.target_id, date: z.date, time: z.time, account: r.account_name, color: r.color,
      status: r.status, text: r.text.replace(/\s+/g, " ").slice(0, 90), url: r.url, repeat: !!r.rrule };
  });
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Calendar</h1><p className="mut mt-1">Times in {tz}. {can(user, "editor") ? "Drag a scheduled post to another day to move it." : ""}</p></div>
        <div className="flex items-center gap-2">
          <Link className="btn btn-sm" href={`/calendar?m=${shift(m, -1)}`} aria-label="Previous month">←</Link>
          <span className="w-36 text-center font-semibold">{title}</span>
          <Link className="btn btn-sm" href={`/calendar?m=${shift(m, 1)}`} aria-label="Next month">→</Link>
          <Link className="btn btn-sm" href="/calendar">Today</Link>
        </div>
      </div>
      <CalendarGrid days={days} month={m} today={utcToZoned(new Date(), tz).date} items={items} tz={tz} canEdit={can(user, "editor")} />
    </div>
  );
}
