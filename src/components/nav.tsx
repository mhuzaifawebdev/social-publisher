"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, CheckCircle2, FileText, LayoutDashboard, Link2, ListChecks, PenSquare, Users } from "lucide-react";
import type { Role } from "@/db/schema";

const ITEMS: { href: string; label: string; icon: React.ElementType; min: Role }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, min: "viewer" },
  { href: "/compose", label: "Compose", icon: PenSquare, min: "editor" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, min: "viewer" },
  { href: "/posts", label: "Posts", icon: ListChecks, min: "viewer" },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2, min: "admin" },
  { href: "/templates", label: "Templates", icon: FileText, min: "editor" },
  { href: "/accounts", label: "Accounts", icon: Link2, min: "viewer" },
  { href: "/reports", label: "Reports", icon: BarChart3, min: "viewer" },
  { href: "/team", label: "Team & settings", icon: Users, min: "admin" },
];
const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

export function Nav({ role, compact = false }: { role: Role; compact?: boolean }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => RANK[role] >= RANK[i.min]);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  if (compact) {
    return (
      <nav className="flex gap-1 overflow-x-auto" aria-label="Main">
        {items.map((i) => (
          <Link key={i.href} href={i.href} prefetch className={`whitespace-nowrap rounded-md px-2 py-1 text-xs ${active(i.href) ? "bg-brand-soft font-semibold text-brand" : "text-mut"}`}>{i.label}</Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <Link key={i.href} href={i.href} prefetch aria-current={active(i.href) ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${active(i.href) ? "bg-brand-soft font-semibold text-brand" : "text-slate-600 hover:bg-slate-50"}`}>
            <Icon size={16} strokeWidth={2} aria-hidden /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
