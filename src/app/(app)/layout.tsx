import { requirePage } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage("viewer");
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-bold text-white">SP</span>
          <span className="font-semibold">Social Publisher</span>
        </div>
        <Nav role={user.role} />
        <div className="mt-auto border-t border-line p-3 text-xs">
          <div className="font-medium">{user.name}</div>
          <div className="mut mb-2 capitalize">{user.role}</div>
          <form action={logout}><button className="btn btn-sm w-full">Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-white px-4 py-2 md:hidden">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-bold text-white">SP</span>
          <Nav role={user.role} compact />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
