import "server-only";
import { envOr } from "./env";

/**
 * Google Gemini (AI Studio key in GEMINI_API_KEY). Text: post writing and card headlines. Image: AI pictures.
 * Models are settings so a retired model is one env change: GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL.
 */
const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const textModel = () => envOr("GEMINI_TEXT_MODEL", "gemini-3.1-flash-lite");
export const imageModel = () => envOr("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-lite-image");
export const geminiOn = () => !!envOr("GEMINI_API_KEY");

export class AiError extends Error {}

function explain(status: number, body: string): string {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(body)) return "Gemini's limit for this key is reached (quota). Try again later, or check the key's plan in Google AI Studio.";
  if (status === 403 || /PERMISSION_DENIED|billing/i.test(body)) return "Google refused: this model needs billing turned on for the Gemini key, or the key is not allowed to use it.";
  if (status === 400 && /API key/i.test(body)) return "The Gemini key is not valid. Check GEMINI_API_KEY in Vercel.";
  if (status === 503) return "Gemini is busy right now. Try again in a minute.";
  return `Gemini answered ${status}: ${body.slice(0, 160)}`;
}

async function call(model: string, payload: unknown, timeoutMs: number) {
  if (!geminiOn()) throw new AiError("Gemini is not set up: add GEMINI_API_KEY in Vercel (see README).");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}/${model}:generateContent`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": envOr("GEMINI_API_KEY") },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    if (!r.ok) throw new AiError(explain(r.status, txt));
    return JSON.parse(txt) as { candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string } };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error).name === "AbortError") throw new AiError("Gemini took too long. Try again.");
    throw new AiError(`Gemini could not be reached: ${(e as Error).message}`);
  } finally { clearTimeout(timer); }
}

/** Text in, JSON out (Gemini's JSON mode with a schema). */
export async function geminiJson<T>(prompt: string, schema: Record<string, unknown>, temperature = 0.8): Promise<T> {
  const d = await call(textModel(), {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: 2048 },
  }, 30_000);
  if (d.promptFeedback?.blockReason) throw new AiError("Gemini declined this request. Rephrase the context.");
  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try { return JSON.parse(text) as T; } catch { throw new AiError("Gemini's answer could not be read. Try again."); }
}

/** One image (PNG/JPEG bytes) from a prompt. aspect: "1:1" | "4:5" | "16:9" … */
export async function geminiImage(prompt: string, aspect = "1:1"): Promise<{ bytes: Buffer; mime: string }> {
  const d = await call(imageModel(), {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } },
  }, 55_000);
  if (d.promptFeedback?.blockReason) throw new AiError("Gemini declined to draw this. Rephrase the context.");
  const part = d.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData) throw new AiError("Gemini returned no image. Try again or change the description.");
  return { bytes: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType || "image/png" };
}
