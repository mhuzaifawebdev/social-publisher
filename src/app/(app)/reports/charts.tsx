"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Day = { day: string; posts: number; impressions: number; reactions: number; comments: number; shares: number; link_clicks: number };
const label = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const AX = { fontSize: 11, fill: "#64748b" };

/** Two charts, one measure family each (never a second y-axis): impressions per day, and engagement per day. */
export function DailyCharts({ data }: { data: Day[] }) {
  const has = data.some((d) => d.impressions || d.reactions || d.comments || d.shares || d.posts);
  if (!has) return <div className="card mut py-10 text-center">No numbers for this period yet. They appear a few hours after posts go out.</div>;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card">
        <h2 className="h2 mb-3">Impressions per day</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={label} tick={AX} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={AX} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip labelFormatter={(d) => label(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="impressions" name="Impressions" stroke="#0a66c2" strokeWidth={2} fill="#0a66c2" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="card">
        <h2 className="h2 mb-3">Engagement per day</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={label} tick={AX} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={AX} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip labelFormatter={(d) => label(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={{ fill: "#f1f5f9" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
              <Bar dataKey="reactions" name="Reactions" stackId="e" fill="#0a66c2" />
              <Bar dataKey="comments" name="Comments" stackId="e" fill="#0d9488" />
              <Bar dataKey="shares" name="Shares" stackId="e" fill="#c2410c" radius={[3, 3, 0, 0]} />
              <Bar dataKey="link_clicks" name="Link clicks" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
