import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export const DEFAULTS = {
  approval_required: false,
  default_timezone: "Europe/Malta",
  linkedin_version_ok: "",
  alert_email: "",
  brand_name: "",
  brand_color: "#0a66c2",
} as const;
export type Settings = { -readonly [K in keyof typeof DEFAULTS]: (typeof DEFAULTS)[K] extends boolean ? boolean : string };

export async function getSettings(): Promise<Settings> {
  const rows = await db().select().from(schema.settings).where(inArray(schema.settings.key, Object.keys(DEFAULTS)));
  const out = { ...DEFAULTS } as Settings;
  for (const r of rows) (out as Record<string, unknown>)[r.key] = r.value;
  return out;
}
export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db().insert(schema.settings).values({ key, value }).onConflictDoUpdate({
    target: schema.settings.key, set: { value, updatedAt: new Date() },
  });
}
export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const [r] = await db().select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return (r ? r.value : DEFAULTS[key]) as Settings[K];
}
