import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SetupForm } from "./form";

export const metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n) redirect("/login");
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="h1">Create the first admin</h1>
        <p className="mut mb-4 mt-1 text-xs">This page works only once, while there are no users. Add the team afterwards on the Team page.</p>
        <SetupForm />
      </div>
    </main>
  );
}
