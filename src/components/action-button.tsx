"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ActionResult = { ok: boolean; message: string };

/** A button that runs a server action, shows a spinner bar while it runs, then its answer, and refreshes the page. */
export function ActionButton({ action, children, confirmText, className = "btn btn-sm", title }: {
  action: () => Promise<ActionResult>; children: React.ReactNode; confirmText?: string; className?: string; title?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {pending && <span className="loadbar" />}
      <button type="button" className={className} disabled={pending} title={title} onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(async () => {
          try { const r = await action(); setMsg(r); router.refresh(); }
          catch (e) { setMsg({ ok: false, message: (e as Error).message || "Something went wrong." }); }
        });
      }}>{pending ? "…" : children}</button>
      {msg && <span role="status" className={`max-w-xs text-[11px] ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.message}</span>}
    </span>
  );
}
