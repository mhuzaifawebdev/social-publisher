export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-[13px] ${error ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok"}`}>
      {(error || ok)!.slice(0, 300)}
    </p>
  );
}
