"use client";
import { useActionState } from "react";
import { setupAdmin } from "../login/actions";

export function SetupForm() {
  const [state, act, pending] = useActionState(setupAdmin, { error: "" });
  return (
    <form action={act} className="space-y-3">
      {pending && <div className="loadbar" />}
      <div><label className="label" htmlFor="name">Your name</label><input className="input" id="name" name="name" required /></div>
      <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required /></div>
      <div><label className="label" htmlFor="password">Password (10+ characters)</label><input className="input" id="password" name="password" type="password" minLength={10} required /></div>
      {state.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad" role="alert">{state.error}</p>}
      <button className="btn btn-primary w-full py-2" disabled={pending}>{pending ? "Creating…" : "Create admin"}</button>
    </form>
  );
}
