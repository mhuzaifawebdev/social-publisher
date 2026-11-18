"use client";
import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, act, pending] = useActionState(login, { error: "" });
  return (
    <form action={act} className="space-y-3">
      {pending && <div className="loadbar" />}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad" role="alert">{state.error}</p>}
      <button className="btn btn-primary w-full py-2" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
