"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zonedToUtc } from "@/lib/time";
import { rescheduleAction } from "../actions";

export type CalItem = { postId: number; targetId: number; date: string; time: string; account: string; color: string;
  status: string; text: string; url: string | null; repeat: boolean };

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MOVABLE = ["scheduled", "held"];

export function CalendarGrid({ days, month, today, items, tz, canEdit }: { days: string[]; month: string; today: string; items: CalItem[]; tz: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [over, setOver] = useState("");
  const [msg, setMsg] = useState("");
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);

  function drop(day: string, raw: string) {
    setOver("");
    const it = items.find((x) => String(x.targetId) === raw);
    if (!it || it.date === day) return;
    start(async () => {
      const r = await rescheduleAction(it.postId, zonedToUtc(day, it.time, tz).toISOString());
      setMsg(r.message);
      router.refresh();
    });
  }

  return (
    <div>
      {pending && <div className="loadbar" />}
      {msg && <p role="status" className="mb-2 text-xs text-mut">{msg}</p>}
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-line bg-line [gap:1px]">
        {WEEK.map((d) => <div key={d} className="bg-slate-50 px-2 py-1.5 text-[11px] font-semibold uppercase text-mut">{d}</div>)}
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const inMonth = day.startsWith(month);
          const past = day < today;
          return (
            <div key={day}
              onDragOver={(e) => { if (canEdit && !past) { e.preventDefault(); setOver(day); } }}
              onDragLeave={() => setOver("")}
              onDrop={(e) => { e.preventDefault(); drop(day, e.dataTransfer.getData("text/plain")); }}
              className={`min-h-28 bg-white p-1.5 ${inMonth ? "" : "bg-slate-50/70"} ${over === day ? "ring-2 ring-inset ring-brand" : ""}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs ${day === today ? "grid h-5 w-5 place-items-center rounded-full bg-brand font-semibold text-white" : inMonth ? "text-ink" : "text-slate-400"}`}>{Number(day.slice(8))}</span>
                {canEdit && !past && <Link href={`/compose?date=${day}`} className="rounded px-1 text-[13px] leading-none text-slate-300 hover:bg-brand-soft hover:text-brand" aria-label={`New post on ${day}`}>+</Link>}
              </div>
              <ul className="space-y-1">
                {list.slice(0, 4).map((it) => {
                  const movable = canEdit && MOVABLE.includes(it.status);
                  const chip = (
                    <span className="flex items-center gap-1 truncate">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: it.color }} aria-hidden />
                      <b className="font-semibold">{it.time}</b> {it.text}
                    </span>
                  );
                  return (
                    <li key={it.targetId} draggable={movable} onDragStart={(e) => e.dataTransfer.setData("text/plain", String(it.targetId))}
                      title={`${it.account} · ${it.status}${it.repeat ? " · repeats" : ""}\n${it.text}`}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${it.status === "published" ? "bg-ok-soft" : it.status === "failed" ? "bg-bad-soft" : it.status === "held" ? "bg-warn-soft" : "bg-brand-soft"} ${movable ? "cursor-grab" : ""}`}>
                      {it.url ? <a href={it.url} target="_blank" rel="noopener noreferrer">{chip}</a> : chip}
                    </li>
                  );
                })}
                {list.length > 4 && <li className="text-[11px] text-mut"><Link href={`/posts?from=${day}&to=${day}`}>+{list.length - 4} more</Link></li>}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="mut mt-2 flex flex-wrap gap-3 text-[11px]">
        <span><span className="mr-1 inline-block h-2 w-3 rounded bg-brand-soft" />scheduled</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded bg-warn-soft" />waiting approval</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded bg-ok-soft" />published</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded bg-bad-soft" />failed</span>
      </div>
    </div>
  );
}
