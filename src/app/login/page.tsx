import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (!n) redirect("/setup");
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">SP</span>
          <div>
            <div className="h2">Social Publisher</div>
            <div className="mut text-xs">Schedule and track your social posts</div>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
