import type { ImageProvider } from "../types";
import { GATEWAY_BASE, decodeBase64, failFrom, framingFor, requireApiKey } from "./shared.server";

/**
 * OpenAI image models on the Lovable AI Gateway.
 * Body shape: `prompt` + `size` (OpenAI models reject `messages`/`modalities`).
 */
export function createOpenAiImageProvider(model: string): ImageProvider {
  return {
    id: `lovable:${model}`,
    async generateImage({ prompt, aspect = "square" }) {
      const apiKey = requireApiKey();

      const response = await fetch(`${GATEWAY_BASE}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          prompt: `${prompt}\n\n${framingFor(aspect)}`,
          size: aspect === "portrait" ? "1024x1536" : "1024x1024",
        }),
      });

      if (!response.ok) await failFrom("IMAGE", response);

      const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> };
      const base64 = payload.data?.[0]?.b64_json;
      if (!base64) throw new Error("IMAGE_EMPTY_RESPONSE");

      return { bytes: decodeBase64(base64), contentType: "image/png" };
    },
  };
}
