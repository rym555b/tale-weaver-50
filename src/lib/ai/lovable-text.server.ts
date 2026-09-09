import type { TextProvider } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? content).trim();
  const start = body.search(/[[{]/);
  if (start === -1) return body;
  const openChar = body[start];
  const closeChar = openChar === "[" ? "]" : "}";
  const end = body.lastIndexOf(closeChar);
  return end > start ? body.slice(start, end + 1) : body.slice(start);
}

/**
 * Text model backed by the Lovable AI Gateway. The API key stays server-side.
 */
export function createLovableTextProvider(): TextProvider {
  return {
    id: `lovable:${MODEL}`,
    async generateJson<T>({ system, prompt, maxOutputTokens = 4000 }): Promise<T> {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("MISSING_AI_KEY");

      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`AI_${response.status}:${detail.slice(0, 400)}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error("AI_EMPTY_RESPONSE");

      try {
        return JSON.parse(extractJson(content)) as T;
      } catch {
        throw new Error("AI_INVALID_JSON");
      }
    },
  };
}
