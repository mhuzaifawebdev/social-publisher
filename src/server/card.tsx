import "server-only";
import { ImageResponse } from "next/og";

/**
 * Branded post graphics drawn by the tool itself (no AI image model, so free and instant): a headline, a short
 * line, a small label and the brand name, in one of three looks. Rendered with next/og to PNG.
 */
export type CardInput = {
  headline: string; sub?: string; kicker?: string; brand: string; color: string;
  style: "bold" | "light" | "dark"; format: "landscape" | "square" | "portrait";
};
export const FORMATS = { landscape: [1200, 627], square: [1080, 1080], portrait: [1080, 1350] } as const;

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export async function renderCard(c: CardInput): Promise<Buffer> {
  const [w, h] = FORMATS[c.format];
  const color = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#0a66c2";
  const big = c.headline.length > 70 ? 54 : c.headline.length > 40 ? 66 : 80;
  const scale = c.format === "landscape" ? 0.82 : 1;
  const bg = c.style === "bold" ? `linear-gradient(135deg, ${color} 0%, ${shade(color, 0.55)} 100%)`
    : c.style === "dark" ? "linear-gradient(160deg, #0b1220 0%, #111a2e 100%)" : "#f7f8fb";
  const ink = c.style === "light" ? "#0f172a" : "#ffffff";
  const mut = c.style === "light" ? "#475569" : "rgba(255,255,255,.82)";
  const accent = c.style === "bold" ? "#ffffff" : color;
  const pad = Math.round(w * 0.075);

  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: bg, padding: pad, fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", right: -w * 0.12, top: -w * 0.12, width: w * 0.5, height: w * 0.5, borderRadius: w,
          background: c.style === "light" ? color : "#ffffff", opacity: c.style === "light" ? 0.08 : 0.07, display: "flex" }} />
        <div style={{ position: "absolute", left: -w * 0.08, bottom: -w * 0.16, width: w * 0.36, height: w * 0.36, borderRadius: w,
          background: accent, opacity: 0.08, display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 14, height: 14, borderRadius: 14, background: accent, display: "flex" }} />
          <div style={{ fontSize: 26 * scale, letterSpacing: 3, textTransform: "uppercase", color: c.style === "light" ? color : mut, fontWeight: 700, display: "flex" }}>
            {(c.kicker || "").slice(0, 40) || " "}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 * scale, maxWidth: w - pad * 2 }}>
          <div style={{ fontSize: big * scale * (c.format === "portrait" ? 1.1 : 1), lineHeight: 1.08, fontWeight: 800, color: ink, letterSpacing: -1.5, display: "flex" }}>
            {c.headline.slice(0, 110)}
          </div>
          {c.sub ? <div style={{ fontSize: 32 * scale, lineHeight: 1.35, color: mut, display: "flex" }}>{c.sub.slice(0, 160)}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 28 * scale, fontWeight: 700, color: ink, display: "flex" }}>{c.brand.slice(0, 40)}</div>
          <div style={{ width: 120 * scale, height: 8, borderRadius: 8, background: accent, display: "flex" }} />
        </div>
      </div>
    ),
    { width: w, height: h },
  );
  return Buffer.from(await img.arrayBuffer());
}
