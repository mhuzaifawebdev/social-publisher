/** Reads a required env var with a clear message (never prints the value). */
export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Setting ${name} is missing. Add it in Vercel > Project > Settings > Environment Variables.`);
  return v;
}
export function envOr(name: string, fallback = ""): string { return process.env[name] || fallback; }
export function appUrl(): string { return envOr("APP_URL", "http://localhost:3000").replace(/\/+$/, ""); }
