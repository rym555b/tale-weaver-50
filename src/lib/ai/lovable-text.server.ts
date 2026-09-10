import type { TextProvider } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

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
    async generateJson<T>({
      system,
      prompt,
      maxOutputTokens = 4000,
    }: {
      system: string;
      prompt: string;
      maxOutputTokens?: number;
    }): Promise<T> {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("MISSING_AI_KEY");

      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          reasoning: { effort: "medium", summary: "auto" },
          input: [
            { role: "developer", content: system },
            {
              role: "user",
              content: `${prompt}\n\nReturn one valid JSON object only. Keep the response under approximately ${maxOutputTokens} tokens.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`AI_${response.status}:${detail.slice(0, 400)}`);
      }

      if (!response.body) throw new Error("AI_EMPTY_RESPONSE");

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let content = "";
      let streamError = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const data = block
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data || data === "[DONE]") continue;
          try {
            const event = JSON.parse(data) as {
              type?: string;
              delta?: string;
              error?: { message?: string };
            };
            if (event.type === "response.output_text.delta" && event.delta) content += event.delta;
            if (event.type === "error") streamError = event.error?.message ?? "AI_STREAM_ERROR";
          } catch {
            // Ignore heartbeats and non-JSON provider frames.
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!content.trim()) throw new Error("AI_EMPTY_RESPONSE");

      try {
        return JSON.parse(extractJson(content)) as T;
      } catch {
        throw new Error("AI_INVALID_JSON");
      }
    },
  };
}
